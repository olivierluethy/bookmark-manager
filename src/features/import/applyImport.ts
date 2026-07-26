import type { QueryDb, Tx } from '@/db/client';
import type { SourceBrowser, NewBookmark } from '@/db/schema';
import { getSystemFolderId } from '@/db/seed';
import { createFolder } from '@/db/repo/folders';
import { insertBookmarks } from '@/db/repo/bookmarks';
import { recordImportBatch } from '@/db/repo/importBatches';
import { pathKey, type ImportPlan } from './planImport';

const CHUNK = 500;

/**
 * Executes a plan. Folders are created shallowest-first so a parent always
 * exists before its child. Bookmarks land in Unsorted when the plan gives them
 * no folder.
 *
 * Takes `db: QueryDb` (not the browser singleton `Db`) and `transaction` as a
 * parameter, matching every other orchestration function in this codebase
 * (see `bootDatabase` in `@/db/boot`) — that is what lets this run against
 * better-sqlite3 in Node tests while production passes the real SQLocal
 * `db`/`transaction`.
 *
 * `getSystemFolderId` is resolved once, up front, *before* the first
 * `transaction()` call — never from inside one. A `db` read issued from
 * inside a `transaction()` callback would be an outside query on SQLocal's
 * exclusive connection lock and deadlock silently forever (see the docs on
 * `Tx`/`transaction()` in `@/db/client`).
 */
export async function applyImport(
  db: QueryDb,
  transaction: <R>(fn: (tx: Tx) => Promise<R>) => Promise<R>,
  plan: ImportPlan,
  meta: { fileName: string; detectedBrowser: SourceBrowser; totalParsed: number },
  onProgress?: (done: number, total: number) => void,
): Promise<{ batchId: string; inserted: number }> {
  const unsortedId = await getSystemFolderId(db, 'unsorted');
  const idByKey = new Map<string, string>();

  // Shallowest first, so a parent's id is always resolved before its child is
  // created. `planImport` already returns `folders` in this order, but
  // re-sorting here keeps this function correct even if a future caller
  // hands it folders in some other order.
  const ordered = [...plan.folders].sort((a, b) => a.path.length - b.path.length);

  await transaction(async (tx) => {
    for (const folder of ordered) {
      if (folder.existingId) {
        idByKey.set(folder.key, folder.existingId);
        continue;
      }
      const parentKey = folder.path.length > 1 ? pathKey(folder.path.slice(0, -1)) : null;
      const parentId = parentKey ? (idByKey.get(parentKey) ?? null) : null;
      const name = folder.path.at(-1) ?? 'Imported';
      idByKey.set(folder.key, await createFolder(db, tx, { name, parentId }));
    }
  });

  const now = Math.floor(Date.now() / 1000);
  const batchId = crypto.randomUUID();

  const rows: NewBookmark[] = plan.bookmarks.map((bookmark) => ({
    id: crypto.randomUUID(),
    folderId: bookmark.folderPathKey
      ? (idByKey.get(bookmark.folderPathKey) ?? unsortedId)
      : unsortedId,
    url: bookmark.url,
    normalizedUrl: bookmark.normalizedUrl,
    urlHash: bookmark.urlHash,
    site: bookmark.site,
    title: bookmark.title,
    description: bookmark.description,
    faviconUrl: bookmark.icon,
    previewImage: null,
    tags: JSON.stringify(bookmark.tags),
    notes: null,
    isPinned: false,
    addedAt: bookmark.addedAt,
    lastOpenedAt: null,
    openCount: 0,
    deletedAt: null,
    sourceBrowser: meta.detectedBrowser,
    importBatchId: batchId,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  }));

  // The batch row must exist before any bookmark referencing it via
  // importBatchId (FK, ON DELETE SET NULL) is inserted, or the insert fails
  // its foreign-key check.
  await transaction((tx) =>
    recordImportBatch(db, tx, {
      id: batchId,
      fileName: meta.fileName,
      detectedBrowser: meta.detectedBrowser,
      totalParsed: meta.totalParsed,
      imported: rows.length,
      skippedDuplicates: plan.counts.duplicatesInDb + plan.counts.duplicatesInFile,
      importedAt: now,
    }),
  );

  // One transaction per chunk keeps each commit bounded and lets progress
  // advance visibly on a 20k-entry import instead of freezing the UI for one
  // giant commit.
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await transaction((tx) => insertBookmarks(db, tx, slice));
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
  }
  // rows.length === 0 still needs a final progress signal so callers that
  // wait for "done === total" don't hang on an empty import.
  if (rows.length === 0) onProgress?.(0, 0);

  return { batchId, inserted: rows.length };
}
