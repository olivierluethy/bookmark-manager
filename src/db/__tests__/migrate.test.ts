import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '@/db/testDb';
import { hashSql, loadMigrations, runMigrations, splitStatements } from '@/db/migrate';

describe('runMigrations', () => {
  it('applies every migration on a fresh database', async () => {
    const { tx, close } = createTestDb();
    const ran = await runMigrations(tx);
    expect(ran.length).toBeGreaterThan(0);
    close();
  });

  it(
    'does not re-run migrations on a second boot against the same database ' +
      '(regression: production read applied-migration rows via a raw sql template, ' +
      'which yields arrays instead of objects under the SQLocal driver, so every ' +
      'migration looked unapplied and the DDL re-ran on every reload)',
    async () => {
      const { tx, close } = createTestDb();
      await runMigrations(tx);

      await expect(runMigrations(tx)).resolves.toEqual([]);
      close();
    },
  );

  it('stays a no-op on a third boot as well', async () => {
    const { tx, close } = createTestDb();
    await runMigrations(tx);
    await runMigrations(tx);

    await expect(runMigrations(tx)).resolves.toEqual([]);
    close();
  });

  it('creates the bookmarks table with a working url_hash index', async () => {
    const { db, tx, close } = createTestDb();
    await runMigrations(tx);
    const idx = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='index' AND name='bookmarks_url_hash_idx'`,
    );
    expect(idx).toHaveLength(1);
    close();
  });

  it('refuses to run when an applied migration was edited', async () => {
    const { tx, close } = createTestDb();
    const first = loadMigrations()[0];
    expect(first).toBeDefined();

    await runMigrations(tx);
    await tx.exec('UPDATE migrations SET hash = ? WHERE id = ?', ['deadbeef', first!.id]);

    await expect(runMigrations(tx)).rejects.toThrow(/modified after it was applied/);
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
