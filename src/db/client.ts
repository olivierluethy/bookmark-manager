import { SQLocalDrizzle } from 'sqlocal/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

/**
 * Narrow write/read seam. SQLocal's TransactionHandle is NOT a Drizzle
 * database — it exposes only query/sql/batch — so statements are built with
 * Drizzle for type safety and executed here as raw SQL. This interface is
 * also what lets repositories (and the migration runner) be tested against
 * better-sqlite3 in Node, exercising the exact same code path production
 * uses.
 *
 * `all` must return row objects (keyed by column name), not row arrays.
 * SQLocal's `TransactionHandle.sql()` (see `Transaction['sql']` in sqlocal's
 * dist/client.d.ts) already normalizes to objects via its
 * convert-rows-to-objects helper, and better-sqlite3's `.all()` returns
 * objects natively — so both implementations below satisfy this without
 * extra conversion.
 */
export type Tx = {
  exec(sql: string, params: unknown[]): Promise<void>;
  all<T extends Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>;
};

export type Db = SqliteRemoteDatabase<typeof schema>;

export const sqlocal = new SQLocalDrizzle({
  databasePath: 'bookmarks.sqlite3',
  verbose: false,
  // SQLite defaults foreign_keys OFF, and the setting is per-connection, not
  // stored in the file. Without this the folder cascade and the bookmarks
  // ON DELETE SET NULL never fire in the browser — while the better-sqlite3
  // test harness, which sets the pragma itself, keeps passing. That divergence
  // is exactly how "tests green, production corrupts" happens.
  onInit: (sql) => [sql`PRAGMA foreign_keys = ON`],
});

export const db: Db = drizzle(sqlocal.driver, sqlocal.batchDriver, { schema });

export function transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
  return sqlocal.transaction(async (handle) => {
    const tx: Tx = {
      exec: async (sql, params) => {
        await handle.sql(sql, ...params);
      },
      all: async <T extends Record<string, unknown>>(sql: string, params: unknown[]) => {
        return await handle.sql<T>(sql, ...params);
      },
    };
    return fn(tx);
  });
}

// `checkEnvironment` used to live here, but this module constructs
// `new SQLocalDrizzle(...)` above at module scope (which spins up a Web
// Worker as a side effect of being *imported*, not of being called) — so
// anything that needs to check the environment before deciding whether to
// touch the database must not import this file to do it. It now lives in
// `./environment`, which has no such side effect.
