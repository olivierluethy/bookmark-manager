import { useCallback, useRef, useState } from 'react';
import { isNull } from 'drizzle-orm';
import { db, transaction } from '@/db/client';
import { listFolders } from '@/db/repo/folders';
import { bookmarks as bookmarksTable } from '@/db/schema';
import { detectBrowser, readSignals } from './browserDetect';
import { parseFilesInWorker } from './workerClient';
import { pathKey, planImport, type ImportPlan, type PlanOptions } from './planImport';
import { applyImport } from './applyImport';
import type { ParsedFile } from './parseNetscape';

// This module imports `@/db/client` at the top level, which constructs
// SQLocal as a side effect of being *loaded* (see the warning in
// `@/db/client`). That is only safe here because nothing eagerly imported by
// `main.tsx` reaches this file: `App.tsx` reaches `ImportModal` (and
// therefore this hook) exclusively through `React.lazy(() => import(...))`,
// so this module's top level does not evaluate until the user opens the
// import flow — well after `boot()` has already run `checkEnvironment()` and
// constructed the real client itself. Do not give this hook (or anything it
// imports) a static import path from `App.tsx`'s eagerly-loaded exports.

export type ImportStage =
  | { kind: 'idle' }
  | { kind: 'parsing'; done: number; total: number; fileName: string }
  | { kind: 'preview'; plan: ImportPlan; files: { fileName: string; parsed: ParsedFile }[] }
  | { kind: 'writing'; done: number; total: number }
  | { kind: 'done'; inserted: number }
  | { kind: 'error'; message: string };

const DEFAULT_OPTIONS: PlanOptions = {
  placement: 'merge',
  skipExactDuplicates: true,
  keepExportRoots: false,
};

/** Builds the existing-state snapshot planImport compares against. */
async function readExisting() {
  const folders = await listFolders(db);
  const byId = new Map(folders.map((f) => [f.id, f]));

  const folderPathKeys = new Map<string, string>();
  for (const folder of folders) {
    if (folder.isSystem) continue;
    const path: string[] = [];
    const seen = new Set<string>();
    let current: typeof folder | undefined = folder;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    folderPathKeys.set(pathKey(path), folder.id);
  }

  // Soft-deleted bookmarks are excluded: a bookmark the user trashed should
  // not silently block re-importing it from a fresh export, matching how
  // every other read in this codebase treats `deletedAt` (see `buildWhere`
  // in `@/db/repo/bookmarks`).
  const rows = await db
    .select({ urlHash: bookmarksTable.urlHash })
    .from(bookmarksTable)
    .where(isNull(bookmarksTable.deletedAt));
  return { folderPathKeys, hashes: new Set(rows.map((r) => r.urlHash)) };
}

export function useImport() {
  const [stage, setStage] = useState<ImportStage>({ kind: 'idle' });
  const [options, setOptionsState] = useState<PlanOptions>(DEFAULT_OPTIONS);
  const [files, setFiles] = useState<{ fileName: string; parsed: ParsedFile }[]>([]);

  // Guards against a slow re-plan (triggered by a fast option toggle)
  // resolving after a newer one and clobbering it with a stale preview.
  const planToken = useRef(0);

  const buildPlan = useCallback(
    async (parsedFiles: { fileName: string; parsed: ParsedFile }[], next: PlanOptions) => {
      const token = ++planToken.current;
      const existing = await readExisting();
      const plan = await planImport(parsedFiles, existing, next);
      if (token !== planToken.current) return; // superseded by a later call
      setStage({ kind: 'preview', plan, files: parsedFiles });
    },
    [],
  );

  const ingest = useCallback(
    async (input: { fileName: string; text: string }[]) => {
      if (input.length === 0) return;
      try {
        setStage({ kind: 'parsing', done: 0, total: input.length, fileName: '' });
        const parsedFiles = await parseFilesInWorker(input, (done, total, fileName) =>
          setStage({ kind: 'parsing', done, total, fileName }),
        );
        setFiles(parsedFiles);
        await buildPlan(parsedFiles, options);
      } catch (e) {
        setStage({ kind: 'error', message: (e as Error).message });
      }
    },
    [buildPlan, options],
  );

  // Re-planning is pure and fast, so changing an option re-runs it
  // immediately, against the *new* options rather than whatever `options`
  // happened to close over — `next` is passed straight through to
  // `buildPlan`, never read back out of state.
  const setOptions = useCallback(
    (next: PlanOptions) => {
      setOptionsState(next);
      if (files.length > 0) void buildPlan(files, next);
    },
    [buildPlan, files],
  );

  const apply = useCallback(async () => {
    if (stage.kind !== 'preview') return;
    const { plan } = stage;
    try {
      setStage({ kind: 'writing', done: 0, total: plan.bookmarks.length });
      const browser = detectBrowser(await readSignals());
      const totalParsed = files.reduce((sum, f) => sum + f.parsed.bookmarks.length, 0);
      const { inserted } = await applyImport(
        db,
        transaction,
        plan,
        {
          fileName: files.map((f) => f.fileName).join(', '),
          detectedBrowser: browser,
          totalParsed,
        },
        (done, total) => setStage({ kind: 'writing', done, total }),
      );
      setStage({ kind: 'done', inserted });
    } catch (e) {
      setStage({ kind: 'error', message: (e as Error).message });
    }
  }, [files, stage]);

  const reset = useCallback(() => {
    setFiles([]);
    setStage({ kind: 'idle' });
  }, []);

  return { stage, options, setOptions, ingest, apply, reset };
}
