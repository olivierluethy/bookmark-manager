import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/db/testDb';
import { runMigrations } from '@/db/migrate';
import { getSetting, setSetting } from '@/db/repo/settings';
import type { Db, Tx } from '@/db/client';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

let db: BetterSQLite3Database<typeof schema>;
let tx: Tx;
let close: () => void;

/**
 * `getSetting`/`setSetting` are typed against production's `Db`
 * (`SqliteRemoteDatabase`, async), which is the interface Task 7 specifies.
 * The test harness's `BetterSQLite3Database` (sync) implements every member
 * either function actually calls — `select`, `insert`, `toSQL` — and only
 * lacks `batch`, which neither calls. Asserting the type here lets the same
 * production functions run against both engines without loosening their
 * public signature to a bespoke union or generic.
 */
function asDb(d: BetterSQLite3Database<typeof schema>): Db {
  return d as unknown as Db;
}

beforeEach(async () => {
  ({ db, tx, close } = createTestDb());
  await runMigrations(tx);
});

describe('settings repository', () => {
  it('returns the fallback for a missing key', async () => {
    expect(await getSetting(asDb(db), 'nope', 42)).toBe(42);
    close();
  });

  it('round-trips structured values', async () => {
    await setSetting(asDb(db), tx, 'panes', { sidebar: 260, detail: 340 });
    expect(await getSetting(asDb(db), 'panes', null)).toEqual({ sidebar: 260, detail: 340 });
    close();
  });

  it('overwrites an existing key rather than duplicating it', async () => {
    await setSetting(asDb(db), tx, 'k', 'a');
    await setSetting(asDb(db), tx, 'k', 'b');
    expect(await getSetting(asDb(db), 'k', '')).toBe('b');
    const rows = await db.select().from(schema.settings);
    expect(rows).toHaveLength(1);
    close();
  });

  it('returns the fallback when a stored value is corrupt', async () => {
    await tx.exec("INSERT INTO settings (key, value) VALUES ('bad', '{oops')", []);
    expect(await getSetting(asDb(db), 'bad', 'safe')).toBe('safe');
    close();
  });
});
