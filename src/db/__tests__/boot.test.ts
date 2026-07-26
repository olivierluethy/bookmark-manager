import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/db/testDb';
import { bootDatabase } from '@/db/boot';
import { folders } from '@/db/schema';
import type { Db } from '@/db/client';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

/**
 * `bootDatabase` is typed against production's `Db`/`transaction`, matching
 * the interface Task 7 specifies. See the identical note in
 * `seed.test.ts`/`settings.test.ts`: the test harness's sync
 * `BetterSQLite3Database` implements every member `bootDatabase` (via
 * `runMigrations`/`seedSystemFolders`) actually calls.
 */
function asDb(d: BetterSQLite3Database<typeof schema>): Db {
  return d as unknown as Db;
}

describe('bootDatabase', () => {
  it('runs migrations and seeds exactly the three system folders on a fresh database', async () => {
    const { db, transaction, close } = createTestDb();
    await bootDatabase(asDb(db), transaction);
    const rows = await db.select().from(folders);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.systemKey).sort()).toEqual(['pinned', 'trash', 'unsorted']);
    close();
  });

  it('is idempotent: a second boot neither re-runs migrations nor duplicates system folders', async () => {
    const { db, transaction, close } = createTestDb();
    await bootDatabase(asDb(db), transaction);
    await bootDatabase(asDb(db), transaction);
    expect(await db.select().from(folders)).toHaveLength(3);
    close();
  });
});
