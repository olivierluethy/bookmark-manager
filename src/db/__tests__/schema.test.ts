import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import { bookmarks, folders } from '../schema';

const DIR = join(process.cwd(), 'src/db/migrations');
const sql = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n');

// The generated migration file(s) separate individual DDL statements with
// this marker. Split on it and execute the statements in order rather than
// reordering anything — statement order matters (see below).
const statements = sql
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

/**
 * Applies the generated migration to a fresh in-memory better-sqlite3
 * database and returns both the raw driver (for asserting on-disk values)
 * and a Drizzle wrapper (for asserting the ORM's mapped values).
 *
 * `bookmarks` is created before `folders` in the generated SQL, which
 * references a table (`folders`) that doesn't exist yet. SQLite resolves
 * FK targets lazily, so this is not an error by itself — but enforcement
 * must be off while the schema is still being built, or the later
 * `folders` CREATE TABLE (whose FK points at itself) plus any impatient
 * enforcement could reject valid DDL. Foreign keys are enabled only after
 * every statement has run.
 */
function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  for (const statement of statements) {
    sqlite.exec(statement);
  }
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema: { folders, bookmarks } });
  return { sqlite, db };
}

const now = 1700000000000;

describe('generated migrations', () => {
  it('creates every table', () => {
    for (const table of ['folders', 'bookmarks', 'import_batches', 'settings']) {
      expect(sql).toContain(`CREATE TABLE \`${table}\``);
    }
  });

  it('creates all five required indexes', () => {
    for (const idx of [
      'bookmarks_url_hash_idx',
      'bookmarks_site_idx',
      'bookmarks_folder_id_idx',
      'bookmarks_deleted_at_idx',
      'folders_parent_id_idx',
    ]) {
      expect(sql).toContain(idx);
    }
  });
});

describe('migration execution (better-sqlite3)', () => {
  it('applies to a real SQLite database without error', () => {
    expect(() => createTestDb()).not.toThrow();
  });

  it('cascades folder deletion through more than one level of nesting', () => {
    const { db } = createTestDb();
    db.insert(folders)
      .values([
        { id: 'root', name: 'Root', createdAt: now, updatedAt: now },
        { id: 'child', parentId: 'root', name: 'Child', createdAt: now, updatedAt: now },
        {
          id: 'grandchild',
          parentId: 'child',
          name: 'Grandchild',
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    db.delete(folders).where(eq(folders.id, 'root')).run();

    expect(db.select().from(folders).all()).toHaveLength(0);
  });

  it('sets bookmarks.folder_id to NULL (not deleting the row) when a folder is removed, including nested folders removed by cascade', () => {
    const { db } = createTestDb();
    db.insert(folders)
      .values([
        { id: 'root', name: 'Root', createdAt: now, updatedAt: now },
        { id: 'child', parentId: 'root', name: 'Child', createdAt: now, updatedAt: now },
      ])
      .run();
    db.insert(bookmarks)
      .values([
        {
          id: 'b-root',
          folderId: 'root',
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
          // Attached to the nested folder, not the one directly deleted.
          id: 'b-child',
          folderId: 'child',
          url: 'https://b.example/',
          normalizedUrl: 'b.example',
          urlHash: 'hash-b',
          site: 'b.example',
          title: 'B',
          addedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    // Deleting 'root' cascades to delete 'child' as well; both bookmarks
    // must survive with folder_id nulled out.
    db.delete(folders).where(eq(folders.id, 'root')).run();

    const rows = db.select().from(bookmarks).orderBy(bookmarks.id).all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(['b-child', 'b-root']);
    for (const row of rows) {
      expect(row.folderId).toBeNull();
    }
  });

  it('round-trips the is_pinned boolean default through raw SQLite and Drizzle', () => {
    const { sqlite, db } = createTestDb();
    db.insert(bookmarks)
      .values({
        id: 'b1',
        url: 'https://a.example/',
        normalizedUrl: 'a.example',
        urlHash: 'hash-a',
        site: 'a.example',
        title: 'A',
        addedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const raw = sqlite.prepare('SELECT is_pinned FROM bookmarks WHERE id = ?').get('b1') as {
      is_pinned: number;
    };
    expect(raw.is_pinned).toBe(0);

    const row = db.select().from(bookmarks).where(eq(bookmarks.id, 'b1')).get();
    expect(row?.isPinned).toBe(false);
  });

  it('rejects a second folder claiming the same system_key', () => {
    const { db } = createTestDb();
    db.insert(folders)
      .values({
        id: 'f1',
        name: 'Unsorted',
        systemKey: 'unsorted',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    expect(() =>
      db
        .insert(folders)
        .values({
          id: 'f2',
          name: 'Unsorted (duplicate)',
          systemKey: 'unsorted',
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('allows multiple folders with a NULL system_key (the unique index is partial)', () => {
    const { db } = createTestDb();
    expect(() =>
      db
        .insert(folders)
        .values([
          { id: 'f1', name: 'Custom 1', createdAt: now, updatedAt: now },
          { id: 'f2', name: 'Custom 2', createdAt: now, updatedAt: now },
        ])
        .run(),
    ).not.toThrow();
  });
});
