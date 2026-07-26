import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/db/testDb';
import { runMigrations } from '@/db/migrate';
import { getSetting, setSetting } from '@/db/repo/settings';
import type { Tx } from '@/db/client';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

let db: BetterSQLite3Database<typeof schema>;
let tx: Tx;
let close: () => void;

beforeEach(async () => {
  ({ db, tx, close } = createTestDb());
  await runMigrations(tx);
});

describe('settings repository', () => {
  it('returns the fallback for a missing key', async () => {
    expect(await getSetting(db, 'nope', 42)).toBe(42);
    close();
  });

  it('round-trips structured values', async () => {
    await setSetting(db, tx, 'panes', { sidebar: 260, detail: 340 });
    expect(await getSetting(db, 'panes', null)).toEqual({ sidebar: 260, detail: 340 });
    close();
  });

  it('overwrites an existing key rather than duplicating it', async () => {
    await setSetting(db, tx, 'k', 'a');
    await setSetting(db, tx, 'k', 'b');
    expect(await getSetting(db, 'k', '')).toBe('b');
    const rows = await db.select().from(schema.settings);
    expect(rows).toHaveLength(1);
    close();
  });

  it('returns the fallback when a stored value is corrupt', async () => {
    await tx.exec("INSERT INTO settings (key, value) VALUES ('bad', '{oops')", []);
    expect(await getSetting(db, 'bad', 'safe')).toBe('safe');
    close();
  });
});
