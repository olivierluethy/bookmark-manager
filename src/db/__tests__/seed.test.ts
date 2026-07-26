import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, DB_INSIDE_TRANSACTION_MESSAGE } from '@/db/testDb';
import { runMigrations } from '@/db/migrate';
import { getSystemFolderId, seedSystemFolders, SYSTEM_FOLDERS, unsortedFilter } from '@/db/seed';
import { bookmarks, folders } from '@/db/schema';
import type { Tx } from '@/db/client';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

let db: BetterSQLite3Database<typeof schema>;
let tx: Tx;
let close: () => void;

const now = 1700000000;

beforeEach(async () => {
  ({ db, tx, close } = createTestDb());
  await runMigrations(tx);
});

describe('seedSystemFolders', () => {
  it('creates exactly the three system folders', async () => {
    await seedSystemFolders(db, tx);
    const rows = await db.select().from(folders);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.isSystem)).toBe(true);
    expect(rows.map((r) => r.systemKey).sort()).toEqual(['pinned', 'trash', 'unsorted']);
    close();
  });

  it('is idempotent across repeated boots', async () => {
    await seedSystemFolders(db, tx);
    await seedSystemFolders(db, tx);
    await seedSystemFolders(db, tx);
    expect(await db.select().from(folders)).toHaveLength(3);
    close();
  });

  it('preserves the original id so bookmarks keep their folder across boots', async () => {
    await seedSystemFolders(db, tx);
    const first = await getSystemFolderId(db, 'unsorted');
    await seedSystemFolders(db, tx);
    expect(await getSystemFolderId(db, 'unsorted')).toBe(first);
    close();
  });

  it('defines all three keys in SYSTEM_FOLDERS', () => {
    expect(SYSTEM_FOLDERS.map((f) => f.systemKey)).toEqual(['unsorted', 'pinned', 'trash']);
    close();
  });
});

describe('getSystemFolderId', () => {
  it('throws when seeding has not run', async () => {
    await expect(getSystemFolderId(db, 'unsorted')).rejects.toThrow(/missing/);
    close();
  });
});

describe('unsortedFilter', () => {
  it('matches a bookmark whose folder_id is NULL and one explicitly set to the unsorted id, but not a bookmark in another folder', async () => {
    await seedSystemFolders(db, tx);
    const unsortedId = await getSystemFolderId(db, 'unsorted');

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

/**
 * A real SQLocal deadlock can't be reproduced against better-sqlite3 — `db`
 * and `tx` share one unlocked connection in Node, so a `db` read inside a
 * BEGIN/COMMIT just works there, which is exactly how this bug shipped.
 * `createTestDb()` instead makes Node *detect the forbidden pattern* (a
 * query executed through `db` while a `transaction()` callback is open) and
 * throw, rather than trying to reproduce the hang itself — the trap is on
 * by default, so this is just `createTestDb()`, not an opt-in.
 */
describe('createTestDb trapDbInTransaction (Node-reproducible regression for the browser deadlock)', () => {
  it('lets seedSystemFolders complete cleanly — it now reads exclusively through tx', async () => {
    const { db: trapDb, transaction, close: trapClose } = createTestDb();
    await transaction((t) => runMigrations(t));

    await expect(
      transaction((t) => seedSystemFolders(trapDb, t)),
    ).resolves.toBeUndefined();

    expect(await trapDb.select().from(folders)).toHaveLength(3);
    trapClose();
  });

  it('fires when a function awaits a db query while a transaction is open — proving the trap has teeth, i.e. it would have caught the pre-fix seedSystemFolders', async () => {
    const { db: trapDb, transaction, close: trapClose } = createTestDb();
    await transaction((t) => runMigrations(t));

    // Reproduces the exact shape of the bug this fixes: an existence check
    // awaited through `db` from inside a `transaction()` callback.
    async function readThroughDbInsideTransaction(): Promise<void> {
      await trapDb
        .select({ systemKey: folders.systemKey })
        .from(folders)
        .where(eq(folders.isSystem, true));
    }

    await expect(transaction(() => readThroughDbInsideTransaction())).rejects.toThrow(
      DB_INSIDE_TRANSACTION_MESSAGE,
    );
    trapClose();
  });
});
