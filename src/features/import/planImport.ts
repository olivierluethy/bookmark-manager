import { hashMany, normalizeUrl, siteOf } from '@/lib/url';
import type { ParsedFile } from './parseNetscape';

export type Placement = 'merge' | 'newFolder' | 'flatten';

export type PlanOptions = {
  placement: Placement;
  skipExactDuplicates: boolean;
  keepExportRoots: boolean;
};

export type PlannedBookmark = {
  url: string;
  normalizedUrl: string;
  urlHash: string;
  site: string;
  title: string;
  description: string | null;
  icon: string | null;
  tags: string[];
  addedAt: number;
  /** pathKey of the owning folder; '' means Unsorted. */
  folderPathKey: string;
};

export type PlannedFolder = { path: string[]; key: string; existingId: string | null };

export type ImportPlan = {
  bookmarks: PlannedBookmark[];
  folders: PlannedFolder[];
  counts: {
    newBookmarks: number;
    duplicatesInDb: number;
    duplicatesInFile: number;
    skipped: number;
    foldersMerged: number;
    foldersCreated: number;
  };
  errors: { fileName: string; message: string }[];
};

/** Synthetic roots browsers add to exports; they are containers, not real folders. */
export const EXPORT_ROOT_NAMES: readonly string[] = [
  'bookmarks bar', 'bookmarks toolbar', 'bookmarks menu',
  'other bookmarks', 'other favorites', 'favorites bar', 'mobile bookmarks',
];

/** PURE. Case-insensitive identity for a folder path. */
export function pathKey(path: string[]): string {
  return path.map((p) => p.trim().toLowerCase()).join('\u0000');
}

/**
 * PURE. Drops the browser's synthetic root. `isToolbar` catches localized
 * toolbar names that the English list would miss.
 */
export function stripExportRoots(path: string[], isToolbar: boolean): string[] {
  if (path.length === 0) return path;
  const first = path[0]!.trim().toLowerCase();
  if (EXPORT_ROOT_NAMES.includes(first) || isToolbar) return path.slice(1);
  return path;
}

export async function planImport(
  files: { fileName: string; parsed: ParsedFile }[],
  existing: { folderPathKeys: Map<string, string>; hashes: Set<string> },
  options: PlanOptions,
): Promise<ImportPlan> {
  const errors: { fileName: string; message: string }[] = [];
  const now = Math.floor(Date.now() / 1000);

  let skipped = 0;
  let duplicatesInDb = 0;
  let duplicatesInFile = 0;

  // Collect every candidate with its resolved folder path first, then hash in
  // one batch — per-row awaits would be slow at 20k.
  type Candidate = { parsed: ParsedFile['bookmarks'][number]; path: string[] };
  const candidates: Candidate[] = [];
  const folderPaths = new Map<string, string[]>();

  const toolbarKeys = new Set<string>();
  for (const { parsed } of files) {
    for (const folder of parsed.folders) {
      if (folder.isToolbar) toolbarKeys.add(pathKey(folder.path));
    }
  }

  const resolvePath = (raw: string[], fileName: string): string[] => {
    if (options.placement === 'flatten') return [];

    const isToolbar = raw.length > 0 && toolbarKeys.has(pathKey(raw.slice(0, 1)));
    const stripped = options.keepExportRoots ? raw : stripExportRoots(raw, isToolbar);

    if (options.placement === 'newFolder') {
      return [fileName.replace(/\.html?$/i, ''), ...stripped];
    }
    return stripped;
  };

  for (const { fileName, parsed } of files) {
    skipped += parsed.skipped;
    for (const message of parsed.errors) errors.push({ fileName, message });

    for (const folder of parsed.folders) {
      const path = resolvePath(folder.path, fileName);
      if (path.length > 0) folderPaths.set(pathKey(path), path);
    }

    for (const bookmark of parsed.bookmarks) {
      candidates.push({ parsed: bookmark, path: resolvePath(bookmark.folderPath, fileName) });
    }
  }

  const normalized = candidates.map((c) => normalizeUrl(c.parsed.url));
  const hashes = await hashMany(normalized);

  const seenInFile = new Set<string>();
  const bookmarks: PlannedBookmark[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const normalizedUrl = normalized[i]!;
    const urlHash = hashes[i]!;

    // Ensure every referenced folder exists in the plan, even when the export
    // declared no <H3> for it and even when the bookmark itself turns out to
    // be a duplicate — folder membership must survive a re-import where
    // every bookmark in that folder is already in the database.
    if (candidate.path.length > 0) folderPaths.set(pathKey(candidate.path), candidate.path);

    if (options.skipExactDuplicates) {
      if (existing.hashes.has(urlHash)) { duplicatesInDb++; continue; }
      if (seenInFile.has(urlHash)) { duplicatesInFile++; continue; }
    } else if (existing.hashes.has(urlHash)) {
      duplicatesInDb++;
    } else if (seenInFile.has(urlHash)) {
      duplicatesInFile++;
    }
    seenInFile.add(urlHash);

    bookmarks.push({
      url: candidate.parsed.url,
      normalizedUrl,
      urlHash,
      site: siteOf(candidate.parsed.url),
      title: candidate.parsed.title,
      description: candidate.parsed.description,
      icon: candidate.parsed.icon,
      tags: candidate.parsed.tags,
      addedAt: candidate.parsed.addedAt ?? now,
      folderPathKey: candidate.path.length > 0 ? pathKey(candidate.path) : '',
    });
  }

  // Every ancestor of a used path must exist too, so the tree has no gaps.
  for (const path of [...folderPaths.values()]) {
    for (let depth = 1; depth < path.length; depth++) {
      const ancestor = path.slice(0, depth);
      folderPaths.set(pathKey(ancestor), ancestor);
    }
  }

  const folders: PlannedFolder[] = [...folderPaths.values()]
    .sort((a, b) => a.length - b.length)
    .map((path) => {
      const key = pathKey(path);
      return { path, key, existingId: existing.folderPathKeys.get(key) ?? null };
    });

  return {
    bookmarks,
    folders,
    counts: {
      newBookmarks: bookmarks.length,
      duplicatesInDb,
      duplicatesInFile,
      skipped,
      foldersMerged: folders.filter((f) => f.existingId !== null).length,
      foldersCreated: folders.filter((f) => f.existingId === null).length,
    },
    errors,
  };
}
