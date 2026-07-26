import { describe, expect, it } from 'vitest';
import { freshDb, makeBookmark } from './helpers';
import {
  buildTree, createFolder, deleteFolder, folderPath, isDescendant, listFolders,
} from '@/db/repo/folders';
import { insertBookmarks, listBookmarks } from '@/db/repo/bookmarks';
import { getSystemFolderId } from '@/db/seed';
import type { Folder } from '@/db/schema';

function row(id: string, parentId: string | null, name: string): Folder {
  return {
    id, parentId, name, icon: null, color: null, sortOrder: 0,
    isSystem: false, systemKey: null, createdAt: 0, updatedAt: 0,
  };
}

describe('buildTree', () => {
  it('nests children under parents and records depth', () => {
    const tree = buildTree([row('a', null, 'A'), row('b', 'a', 'B'), row('c', 'b', 'C')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.depth).toBe(0);
    expect(tree[0]!.children[0]!.name).toBe('B');
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
  });

  it('treats a row with a missing parent as a root rather than dropping it', () => {
    const tree = buildTree([row('orphan', 'gone', 'Orphan')]);
    expect(tree.map((n) => n.id)).toEqual(['orphan']);
  });

  it('sorts siblings by sortOrder then name', () => {
    const rows = [row('a', null, 'Zebra'), row('b', null, 'Apple')];
    expect(buildTree(rows).map((n) => n.name)).toEqual(['Apple', 'Zebra']);
  });
});

describe('folderPath', () => {
  it('returns root-first names', () => {
    const rows = [row('a', null, 'A'), row('b', 'a', 'B'), row('c', 'b', 'C')];
    expect(folderPath(rows, 'c')).toEqual(['A', 'B', 'C']);
  });

  it('returns an empty path for an unknown id', () => {
    expect(folderPath([], 'nope')).toEqual([]);
  });
});

describe('isDescendant', () => {
  const rows = [row('a', null, 'A'), row('b', 'a', 'B'), row('c', 'b', 'C')];

  it('detects nested descendants', () => {
    expect(isDescendant(rows, 'c', 'a')).toBe(true);
    expect(isDescendant(rows, 'a', 'c')).toBe(false);
  });

  it('treats a folder as its own descendant so it cannot be dropped into itself', () => {
    expect(isDescendant(rows, 'a', 'a')).toBe(true);
  });

  it('terminates on a cycle instead of hanging', () => {
    const cyclic = [row('x', 'y', 'X'), row('y', 'x', 'Y')];
    expect(isDescendant(cyclic, 'x', 'z')).toBe(false);
  });
});

describe('createFolder', () => {
  it('persists a folder and reads it back in the tree', async () => {
    const { db, tx, close } = await freshDb();
    const id = await createFolder(db, tx, { name: 'Dev', parentId: null });
    const child = await createFolder(db, tx, { name: 'Tools', parentId: id });

    const rows = await listFolders(db);
    expect(folderPath(rows, child)).toEqual(['Dev', 'Tools']);
    close();
  });
});

describe('deleteFolder', () => {
  it('reassigns the folder\'s bookmarks to Unsorted and removes the folder', async () => {
    const { db, tx, close } = await freshDb();
    const unsortedId = await getSystemFolderId(db, 'unsorted');
    const folderId = await createFolder(db, tx, { name: 'Temp', parentId: null });
    await insertBookmarks(db, tx, [
      await makeBookmark('https://example.com/kept', { folderId }),
    ]);

    await deleteFolder(db, tx, folderId, unsortedId);

    const remainingFolders = await listFolders(db);
    expect(remainingFolders.find((f) => f.id === folderId)).toBeUndefined();

    const underUnsorted = await listBookmarks(
      db,
      { folderId: unsortedId },
      { key: 'title', dir: 'asc' },
    );
    expect(underUnsorted.map((b) => b.url)).toContain('https://example.com/kept');
    close();
  });
});
