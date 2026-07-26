import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { QueryDb, Tx } from '../client';
import { bookmarks, type Bookmark, type NewBookmark, type SourceBrowser } from '../schema';
import { getSystemFolderId, unsortedFilter } from '../seed';
import type { FolderNode } from './folders';
// Sort types live in lib/, not the UI store — the data layer must not depend
// on UI state.
import type { SortDir, SortKey } from '@/lib/sort';

/** SQLite's default variable limit is 999; stay well under it. */
const CHUNK = 500;

export type BookmarkFilter = {
  folderId?: string | null;
  site?: string;
  tag?: string;
  sourceBrowser?: SourceBrowser;
  importBatchId?: string;
  untagged?: boolean;
  neverOpened?: boolean;
  addedBefore?: number;
  includeDeleted?: boolean;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function insertBookmarks(db: QueryDb, tx: Tx, rows: NewBookmark[]): Promise<void> {
  for (const batch of chunk(rows, CHUNK)) {
    if (batch.length === 0) continue;
    const built = db.insert(bookmarks).values(batch).toSQL();
    await tx.exec(built.sql, built.params);
  }
}

/**
 * "Unsorted" is representable two ways in the schema — a NULL folder_id or
 * the seeded Unsorted folder's own id (see `unsortedFilter` in `../seed`).
 * Whenever the caller filters by Unsorted's id (or by `null`, meaning "no
 * folder"), both representations must match, or a bookmark reassigned to
 * NULL by an `ON DELETE SET NULL` cascade would silently vanish from the
 * Unsorted view. This is the single place that ambiguity is resolved for
 * reads — every other caller goes through this function.
 */
async function buildWhere(db: QueryDb, filter: BookmarkFilter): Promise<SQL | undefined> {
  const clauses: SQL[] = [];
  if (!filter.includeDeleted) clauses.push(isNull(bookmarks.deletedAt));
  if (filter.folderId !== undefined) {
    const unsortedId = await getSystemFolderId(db, 'unsorted');
    clauses.push(
      filter.folderId === null || filter.folderId === unsortedId
        ? unsortedFilter(unsortedId)
        : eq(bookmarks.folderId, filter.folderId),
    );
  }
  if (filter.site) clauses.push(eq(bookmarks.site, filter.site));
  if (filter.sourceBrowser) clauses.push(eq(bookmarks.sourceBrowser, filter.sourceBrowser));
  if (filter.importBatchId) clauses.push(eq(bookmarks.importBatchId, filter.importBatchId));
  if (filter.untagged) clauses.push(eq(bookmarks.tags, '[]'));
  if (filter.neverOpened) clauses.push(eq(bookmarks.openCount, 0));
  if (filter.addedBefore !== undefined) clauses.push(lt(bookmarks.addedAt, filter.addedBefore));
  // Tags are a JSON array in a text column; a LIKE on the quoted value is exact
  // enough because tag strings are stored JSON-escaped.
  if (filter.tag) clauses.push(sql`${bookmarks.tags} LIKE ${`%"${filter.tag}"%`}`);
  return clauses.length ? and(...clauses) : undefined;
}

const SORT_COLUMNS = {
  title: bookmarks.title,
  addedAt: bookmarks.addedAt,
  lastOpenedAt: bookmarks.lastOpenedAt,
  openCount: bookmarks.openCount,
  site: bookmarks.site,
  manual: bookmarks.sortOrder,
} as const;

export async function listBookmarks(
  db: QueryDb,
  filter: BookmarkFilter,
  sort: { key: SortKey; dir: SortDir },
): Promise<Bookmark[]> {
  const column = SORT_COLUMNS[sort.key];
  const where = await buildWhere(db, filter);
  return db
    .select()
    .from(bookmarks)
    .where(where)
    .orderBy(sort.dir === 'asc' ? asc(column) : desc(column));
}

/** Returns the subset of `hashes` already present. Chunked past the variable limit. */
export async function findByHashes(db: QueryDb, hashes: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of chunk(hashes, CHUNK)) {
    if (batch.length === 0) continue;
    const rows = await db
      .select({ urlHash: bookmarks.urlHash })
      .from(bookmarks)
      .where(inArray(bookmarks.urlHash, batch));
    for (const row of rows) found.add(row.urlHash);
  }
  return found;
}

export async function countsByFolder(db: QueryDb): Promise<Map<string, number>> {
  const rows = await db
    .select({ folderId: bookmarks.folderId, count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(and(isNull(bookmarks.deletedAt), isNotNull(bookmarks.folderId)))
    .groupBy(bookmarks.folderId);
  return new Map(rows.filter((r) => r.folderId).map((r) => [r.folderId!, r.count]));
}

/** PURE. Adds each subtree's totals into its ancestors. O(n). */
export function rollupCounts(
  tree: FolderNode[],
  direct: Map<string, number>,
): Map<string, number> {
  const rolled = new Map<string, number>();
  const visit = (node: FolderNode): number => {
    let total = direct.get(node.id) ?? 0;
    for (const child of node.children) total += visit(child);
    rolled.set(node.id, total);
    return total;
  };
  for (const node of tree) visit(node);
  return rolled;
}

export async function recordOpen(db: QueryDb, tx: Tx, id: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const built = db
    .update(bookmarks)
    .set({ openCount: sql`${bookmarks.openCount} + 1`, lastOpenedAt: now, updatedAt: now })
    .where(eq(bookmarks.id, id))
    .toSQL();
  await tx.exec(built.sql, built.params);
}
