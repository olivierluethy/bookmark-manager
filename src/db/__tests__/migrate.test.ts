import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '@/db/testDb';
import { hashSql, loadMigrations, runMigrations, splitStatements } from '@/db/migrate';

describe('runMigrations', () => {
  it('applies every migration on a fresh database', async () => {
    const { tx, close } = createTestDb();
    const ran = await runMigrations(tx, new Map());
    expect(ran.length).toBeGreaterThan(0);
    close();
  });

  it('is idempotent — a second run applies nothing', async () => {
    const { db, tx, close } = createTestDb();
    await runMigrations(tx, new Map());

    const rows = db.all<{ id: string; hash: string }>(sql`SELECT id, hash FROM migrations`);
    const applied = new Map(rows.map((r) => [r.id, r.hash]));

    expect(await runMigrations(tx, applied)).toEqual([]);
    close();
  });

  it('creates the bookmarks table with a working url_hash index', async () => {
    const { db, tx, close } = createTestDb();
    await runMigrations(tx, new Map());
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
    const stale = new Map([[first!.id, 'deadbeef']]);
    await expect(runMigrations(tx, stale)).rejects.toThrow(/modified after it was applied/);
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
