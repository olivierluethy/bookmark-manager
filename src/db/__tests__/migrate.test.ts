import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '@/db/testDb';
import { hashSql, loadMigrations, runMigrations, splitStatements } from '@/db/migrate';

describe('runMigrations', () => {
  it('applies every migration on a fresh database', async () => {
    const { transaction, close } = createTestDb();
    const ran = await transaction((tx) => runMigrations(tx));
    expect(ran.length).toBeGreaterThan(0);
    close();
  });

  it(
    'does not re-run migrations on a second boot against the same database ' +
      '(regression: production read applied-migration rows via a raw sql template, ' +
      'which yields arrays instead of objects under the SQLocal driver, so every ' +
      'migration looked unapplied and the DDL re-ran on every reload)',
    async () => {
      const { transaction, close } = createTestDb();
      await transaction((tx) => runMigrations(tx));

      await expect(transaction((tx) => runMigrations(tx))).resolves.toEqual([]);
      close();
    },
  );

  it('stays a no-op on a third boot as well', async () => {
    const { transaction, close } = createTestDb();
    await transaction((tx) => runMigrations(tx));
    await transaction((tx) => runMigrations(tx));

    await expect(transaction((tx) => runMigrations(tx))).resolves.toEqual([]);
    close();
  });

  it('creates the bookmarks table with a working url_hash index', async () => {
    const { db, transaction, close } = createTestDb();
    await transaction((tx) => runMigrations(tx));
    const idx = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='index' AND name='bookmarks_url_hash_idx'`,
    );
    expect(idx).toHaveLength(1);
    close();
  });

  it('refuses to run when an applied migration was edited', async () => {
    const { tx, transaction, close } = createTestDb();
    const first = loadMigrations()[0];
    expect(first).toBeDefined();

    await transaction((t) => runMigrations(t));
    await tx.exec('UPDATE migrations SET hash = ? WHERE id = ?', ['deadbeef', first!.id]);

    await expect(transaction((t) => runMigrations(t))).rejects.toThrow(
      /modified after it was applied/,
    );
    close();
  });
});

describe('createTestDb transaction (atomicity)', () => {
  // Proves the test harness can reproduce production's atomicity, which is
  // the whole point of Tx being transactional here: a throw partway through
  // a migration sequence must leave the database exactly as it was before —
  // no partial DDL, no partial bookkeeping row. If `transaction()` were a
  // passthrough that just called `fn(tx)` (no BEGIN/COMMIT/ROLLBACK), both
  // `sqlite_master` and `migrations` would still show the effects of the
  // statements that ran before the throw, and the two assertions below would
  // fail.
  it('rolls back every statement, including bookkeeping, when a later statement in the sequence fails', async () => {
    const { tx, transaction, close } = createTestDb();

    // Establish a real baseline first, exactly like a normal boot — this is
    // what creates the `migrations` bookkeeping table.
    await transaction((t) => runMigrations(t));

    await expect(
      transaction(async (t) => {
        await t.exec('INSERT INTO migrations (id, hash, applied_at) VALUES (?, ?, ?)', [
          '9999_atomicity_probe.sql',
          'deadbeef',
          0,
        ]);
        await t.exec('CREATE TABLE atomicity_probe (id INTEGER PRIMARY KEY)', []);
        // A later statement in the same sequence fails (duplicate CREATE
        // TABLE) — everything above must be undone, not just this statement.
        await t.exec('CREATE TABLE atomicity_probe (id INTEGER PRIMARY KEY)', []);
      }),
    ).rejects.toThrow(/already exists/);

    const bogusTable = await tx.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='atomicity_probe'",
      [],
    );
    expect(bogusTable).toHaveLength(0);

    const bogusRow = await tx.all<{ id: string }>(
      "SELECT id FROM migrations WHERE id = '9999_atomicity_probe.sql'",
      [],
    );
    expect(bogusRow).toHaveLength(0);

    close();
  });
});

describe('splitStatements', () => {
  it('splits on drizzle statement breakpoints and drops empties', () => {
    expect(splitStatements('A;\n--> statement-breakpoint\nB;\n')).toEqual(['A;', 'B;']);
  });
});

describe('hashSql', () => {
  it('is stable and input-sensitive', () => {
    expect(hashSql('abc')).toBe(hashSql('abc'));
    expect(hashSql('abc')).not.toBe(hashSql('abd'));
  });
});
