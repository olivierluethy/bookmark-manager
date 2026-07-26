import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/db/testDb';
import { runMigrations } from '@/db/migrate';
import { getSystemFolderId, seedSystemFolders, SYSTEM_FOLDERS, unsortedFilter } from '@/db/seed';
import { bookmarks, folders } from '@/db/schema';
import type { Db, Tx } from '@/db/client';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

let db: BetterSQLite3Database<typeof schema>;
let tx: Tx;
let close: () => void;

const now = 1700000000;

/**
 * `seedSystemFolders`/`getSystemFolderId` are typed against production's
 * `Db` (`SqliteRemoteDatabase`, async), which is the interface Task 7
 * specifies. The test harness's `BetterSQLite3Database` (sync) implements
 * every member either function actually calls — `select`, `insert`,
 * `toSQL` — and only lacks `batch`, which neither calls. Asserting the type
 * here lets the same production functions run against both engines without
 * loosening their public signature to a bespoke union or generic.
 */
function asDb(d: BetterSQLite3Database<typeof schema>): Db {
  return d as unknown as Db;
}

beforeEach(async () => {
  ({ db, tx, close } = createTestDb());
  await runMigrations(tx);
});

describe('seedSystemFolders', () => {
  it('creates exactly the three system folders', async () => {
    await seedSystemFolders(asDb(db), tx);
    const rows = await db.select().from(folders);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.isSystem)).toBe(true);
    expect(rows.map((r) => r.systemKey).sort()).toEqual(['pinned', 'trash', 'unsorted']);
    close();
  });

  it('is idempotent across repeated boots', async () => {
    await seedSystemFolders(asDb(db), tx);
    await seedSystemFolders(asDb(db), tx);
    await seedSystemFolders(asDb(db), tx);
    expect(await db.select().from(folders)).toHaveLength(3);
    close();
  });

  it('preserves the original id so bookmarks keep their folder across boots', async () => {
    await seedSystemFolders(asDb(db), tx);
    const first = await getSystemFolderId(asDb(db), 'unsorted');
    await seedSystemFolders(asDb(db), tx);
    expect(await getSystemFolderId(asDb(db), 'unsorted')).toBe(first);
    close();
  });

  it('defines all three keys in SYSTEM_FOLDERS', () => {
    expect(SYSTEM_FOLDERS.map((f) => f.systemKey)).toEqual(['unsorted', 'pinned', 'trash']);
    close();
  });
});

describe('getSystemFolderId', () => {
  it('throws when seeding has not run', async () => {
    await expect(getSystemFolderId(asDb(db), 'unsorted')).rejects.toThrow(/missing/);
    close();
  });
});

describe('unsortedFilter', () => {
  it('matches a bookmark whose folder_id is NULL and one explicitly set to the unsorted id, but not a bookmark in another folder', async () => {
    await seedSystemFolders(asDb(db), tx);
    const unsortedId = await getSystemFolderId(asDb(db), 'unsorted');

    await db.insert(folders).values({
      id: 'other-folder',
      name: 'Other',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(bookmarks).values([
      {
        id: 'b-null',
        folderId: null,
        url: 'https://a.example/',
        normalizedUrl: 'a.example',
        urlHash: 'hash-a',
        site: 'a.example',
        title: 'A',
        addedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'b-unsorted-id',
        folderId: unsortedId,
        url: 'https://b.example/',
        normalizedUrl: 'b.example',
        urlHash: 'hash-b',
        site: 'b.example',
        title: 'B',
        addedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'b-other',
        folderId: 'other-folder',
        url: 'https://c.example/',
        normalizedUrl: 'c.example',
        urlHash: 'hash-c',
        site: 'c.example',
        title: 'C',
        addedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const rows = await db.select().from(bookmarks).where(unsortedFilter(unsortedId));
    expect(rows.map((r) => r.id).sort()).toEqual(['b-null', 'b-unsorted-id']);
    close();
  });
});
