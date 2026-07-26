import { asc, eq } from 'drizzle-orm';
import type { QueryDb, Tx } from '../client';
import { bookmarks, folders, type Folder } from '../schema';

export type FolderNode = Folder & { children: FolderNode[]; depth: number };

export function listFolders(db: QueryDb): Promise<Folder[]> {
  return db.select().from(folders).orderBy(asc(folders.sortOrder), asc(folders.name));
}

/**
 * PURE. O(n). A row whose parent is missing becomes a root rather than
 * disappearing — losing bookmarks to a dangling parentId would be worse than
 * showing the folder in the wrong place.
 */
export function buildTree(rows: Folder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [], depth: 0 });

  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortSiblings = (list: FolderNode[], depth: number) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const node of list) {
      node.depth = depth;
      sortSiblings(node.children, depth + 1);
    }
  };
  sortSiblings(roots, 0);
  return roots;
}

/** PURE. Root-first folder names. Cycle-safe. */
export function folderPath(rows: Folder[], id: string): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/**
 * PURE. True when `candidate` is `ancestor` or sits beneath it. Used to block
 * dropping a folder into its own subtree. Cycle-safe.
 */
export function isDescendant(rows: Folder[], candidate: string, ancestor: string): boolean {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  let current: string | null | undefined = candidate;
  while (current && !seen.has(current)) {
    if (current === ancestor) return true;
    seen.add(current);
    current = byId.get(current)?.parentId;
  }
  return false;
}

export async function createFolder(
  db: QueryDb,
  tx: Tx,
  input: { name: string; parentId: string | null; icon?: string; color?: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const built = db
    .insert(folders)
    .values({
      id,
      parentId: input.parentId,
      name: input.name,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder: 0,
      isSystem: false,
      systemKey: null,
      createdAt: now,
      updatedAt: now,
    })
    .toSQL();
  await tx.exec(built.sql, built.params);
  return id;
}

export async function renameFolder(db: QueryDb, tx: Tx, id: string, name: string): Promise<void> {
  const built = db
    .update(folders)
    .set({ name, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(folders.id, id))
    .toSQL();
  await tx.exec(built.sql, built.params);
}

/**
 * Deletes a folder, first reassigning its direct bookmarks to Unsorted.
 *
 * The `ON DELETE SET NULL` FK on `bookmarks.folder_id` is a database-level
 * safety net (it fires regardless of caller), but relying on it alone would
 * leave those bookmarks with a NULL folder_id rather than the seeded
 * Unsorted folder's id — both representations mean "unsorted" (see
 * `unsortedFilter` in `../seed`), but explicitly pointing them at Unsorted's
 * id is the intended behaviour so they show up under a concrete, visible
 * folder rather than only via the NULL special-case.
 */
export async function deleteFolder(
  db: QueryDb,
  tx: Tx,
  id: string,
  unsortedId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const reassign = db
    .update(bookmarks)
    .set({ folderId: unsortedId, updatedAt: now })
    .where(eq(bookmarks.folderId, id))
    .toSQL();
  await tx.exec(reassign.sql, reassign.params);

  const remove = db.delete(folders).where(eq(folders.id, id)).toSQL();
  await tx.exec(remove.sql, remove.params);
}
