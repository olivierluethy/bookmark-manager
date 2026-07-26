import { describe, expect, it } from 'vitest';
import { freshDb, makeBookmark } from './helpers';
import { buildTree, createFolder } from '@/db/repo/folders';
import {
  countsByFolder, findByHashes, insertBookmarks, listBookmarks, recordOpen, rollupCounts,
} from '@/db/repo/bookmarks';
import { getSystemFolderId } from '@/db/seed';
import type { Folder } from '@/db/schema';

describe('insertBookmarks', () => {
  it('inserts and reads back', async () => {
    const { db, tx, close } = await freshDb();
    await insertBookmarks(db, tx, [
      await makeBookmark('https://react.dev'),
      await makeBookmark('https://vite.dev'),
    ]);
    expect(await listBookmarks(db, {}, { key: 'title', dir: 'asc' })).toHaveLength(2);
    close();
  });

  it('handles more than one chunk without dropping rows', async () => {
    const { db, tx, close } = await freshDb();
    const rows = await Promise.all(
      Array.from({ length: 1201 }, (_, i) => makeBookmark(`https://example.com/${i}`)),
    );
    await insertBookmarks(db, tx, rows);
    expect(await listBookmarks(db, {}, { key: 'title', dir: 'asc' })).toHaveLength(1201);
    close();
  });

  it('accepts an empty array without emitting SQL', async () => {
    const { db, tx, close } = await freshDb();
    await expect(insertBookmarks(db, tx, [])).resolves.toBeUndefined();
    close();
  });
});

describe('listBookmarks filters', () => {
  it('hides soft-deleted rows unless asked', async () => {
    const { db, tx, close } = await freshDb();
    await insertBookmarks(db, tx, [
      await makeBookmark('https://a.com'),
      await makeBookmark('https://b.com', { deletedAt: 100 }),
    ]);
    expect(await listBookmarks(db, {}, { key: 'title', dir: 'asc' })).toHaveLength(1);
    expect(
      await listBookmarks(db, { includeDeleted: true }, { key: 'title', dir: 'asc' }),
    ).toHaveLength(2);
    close();
  });

  it('filters by site, untagged, and never-opened', async () => {
    const { db, tx, close } = await freshDb();
    await insertBookmarks(db, tx, [
      await makeBookmark('https://w3schools.com/html/default.asp', { tags: '["html"]' }),
      await makeBookmark('https://w3schools.com/js/default.asp', { openCount: 3 }),
      await makeBookmark('https://react.dev'),
    ]);

    expect(
      await listBookmarks(db, { site: 'w3schools.com' }, { key: 'title', dir: 'asc' }),
    ).toHaveLength(2);
    expect(await listBookmarks(db, { untagged: true }, { key: 'title', dir: 'asc' }))
      .toHaveLength(2);
    expect(await listBookmarks(db, { neverOpened: true }, { key: 'title', dir: 'asc' }))
      .toHaveLength(2);
    close();
  });

  it('sorts ascending and descending', async () => {
    const { db, tx, close } = await freshDb();
    await insertBookmarks(db, tx, [
      await makeBookmark('https://a.com', { title: 'Beta' }),
      await makeBookmark('https://b.com', { title: 'Alpha' }),
    ]);
    const asc = await listBookmarks(db, {}, { key: 'title', dir: 'asc' });
    expect(asc.map((b) => b.title)).toEqual(['Alpha', 'Beta']);
    const desc = await listBookmarks(db, {}, { key: 'title', dir: 'desc' });
    expect(desc.map((b) => b.title)).toEqual(['Beta', 'Alpha']);
    close();
  });

  it('matches a NULL-folder bookmark when filtering by the Unsorted folder id', async () => {
    const { db, tx, close } = await freshDb();
    const unsortedId = await getSystemFolderId(db, 'unsorted');
    const otherFolderId = await createFolder(db, tx, { name: 'Other', parentId: null });
    await insertBookmarks(db, tx, [
      await makeBookmark('https://null-folder.example', { folderId: null }),
      await makeBookmark('https://unsorted-id.example', { folderId: unsortedId }),
      await makeBookmark('https://other-folder.example', { folderId: otherFolderId }),
    ]);

    const rows = await listBookmarks(db, { folderId: unsortedId }, { key: 'title', dir: 'asc' });
    expect(rows.map((b) => b.url).sort()).toEqual([
      'https://null-folder.example',
      'https://unsorted-id.example',
    ]);
    close();
  });
});

describe('findByHashes', () => {
  it('returns only the hashes already present', async () => {
    const { db, tx, close } = await freshDb();
    const existing = await makeBookmark('https://react.dev');
    await insertBookmarks(db, tx, [existing]);
    const found = await findByHashes(db, [existing.urlHash, 'absent-hash']);
    expect(found.has(existing.urlHash)).toBe(true);
    expect(found.has('absent-hash')).toBe(false);
    close();
  });

  it('chunks large hash lists past the SQLite variable limit', async () => {
    const { db, tx, close } = await freshDb();
    const rows = await Promise.all(
      Array.from({ length: 2000 }, (_, i) => makeBookmark(`https://example.com/${i}`)),
    );
    await insertBookmarks(db, tx, rows);
    const found = await findByHashes(db, rows.map((r) => r.urlHash));
    expect(found.size).toBe(2000);
    close();
  });
});

describe('counts', () => {
  it('counts per folder and rolls up through the tree', async () => {
    const { db, tx, close } = await freshDb();
    const unsorted = await getSystemFolderId(db, 'unsorted');
    await insertBookmarks(db, tx, [
      await makeBookmark('https://a.com', { folderId: unsorted }),
      await makeBookmark('https://b.com', { folderId: unsorted }),
    ]);

    const direct = await countsByFolder(db);
    expect(direct.get(unsorted)).toBe(2);

    const rows: Folder[] = await db.select().from((await import('@/db/schema')).folders);
    const rolled = rollupCounts(buildTree(rows), direct);
    expect(rolled.get(unsorted)).toBe(2);
    close();
  });

  it('rollupCounts sums descendants into ancestors', () => {
    const tree = buildTree([
      { id: 'a', parentId: null, name: 'A', icon: null, color: null, sortOrder: 0, isSystem: false, systemKey: null, createdAt: 0, updatedAt: 0 },
      { id: 'b', parentId: 'a', name: 'B', icon: null, color: null, sortOrder: 0, isSystem: false, systemKey: null, createdAt: 0, updatedAt: 0 },
    ]);
    const rolled = rollupCounts(tree, new Map([['a', 1], ['b', 4]]));
    expect(rolled.get('a')).toBe(5);
    expect(rolled.get('b')).toBe(4);
  });
});

describe('recordOpen', () => {
  it('increments openCount and sets lastOpenedAt', async () => {
    const { db, tx, close } = await freshDb();
    const row = await makeBookmark('https://react.dev');
    await insertBookmarks(db, tx, [row]);
    await recordOpen(db, tx, row.id!);

    const [after] = await listBookmarks(db, {}, { key: 'title', dir: 'asc' });
    expect(after!.openCount).toBe(1);
    expect(after!.lastOpenedAt).toBeGreaterThan(0);
    close();
  });
});
