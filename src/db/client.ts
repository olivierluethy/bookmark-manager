import { SQLocalDrizzle } from 'sqlocal/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { SqliteRemoteDatabase, SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { RunResult } from 'better-sqlite3';
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
 *
 * THE RULE, and why it is not optional: inside a `transaction()` callback,
 * every *execution* — read or write — must go through `Tx` (`tx.exec` for
 * writes, `tx.all` for reads). `db` may still appear in that callback, but
 * only to *build* a statement via Drizzle's query builder (`.toSQL()`,
 * which serializes and executes nothing) before handing the SQL to `tx`.
 * Never `await` a `db.select()` / `db.all()` / any Drizzle query inside a
 * transaction callback.
 *
 * Why: SQLocal's `transaction()` holds an exclusive connection-scoped lock
 * for the callback's whole duration. A query issued through `db` from
 * inside that callback is an *outside* query on that same connection — it
 * blocks waiting for the transaction to finish, while the transaction
 * blocks waiting for the callback to return. That is a silent, permanent
 * deadlock: no exception, no console output, the app just never renders.
 * This is exactly what SQLocal's own docs warn about when they say
 * Drizzle's transaction method "cannot isolate transactions from outside
 * queries." It will not reproduce against better-sqlite3 in Node, because
 * `createTestDb()` gives `db` and `tx` the same connection with no locking
 * — a read issued through `db` inside a BEGIN/COMMIT just works there. Do
 * not use that as evidence it is safe; use `createTestDb({
 * trapDbInTransaction: true })` instead, which makes Node fail loudly for
 * this exact pattern.
 */
export type Tx = {
  exec(sql: string, params: unknown[]): Promise<void>;
  all<T extends Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>;
};

export type Db = SqliteRemoteDatabase<typeof schema>;

/**
 * The only database surface repositories may take. Deliberately excludes
 * run/all/get/values/batch/transaction: those differ between the async
 * sqlite-proxy driver used in the browser and the sync better-sqlite3 driver
 * used in tests, and every browser-only bug in this project so far has come
 * from that divergence. Execute through the Tx seam instead.
 *
 * Neither of the two obvious formulations works here, so this uses a third:
 *
 * - `Pick<Db, 'select' | 'insert' | 'update' | 'delete'>` was tried first and
 *   rejected: Drizzle's query builders carry a `"sync" | "async"` result-kind
 *   type parameter through `insert`/`update`/`delete`'s return types (e.g.
 *   `SQLiteInsertBase<..., "async", SqliteRemoteResult<unknown>, ...>` for
 *   `Db` vs `SQLiteInsertBase<..., "sync", RunResult, ...>` for
 *   `BetterSQLite3Database`), so `Pick` on `Db` alone is only ever satisfied
 *   by an actual async driver — a sync `BetterSQLite3Database` is not
 *   assignable to it.
 * - A plain union of the two concrete driver types (`SqliteRemoteDatabase |
 *   BetterSQLite3Database`) was tried next and also rejected: `select` is
 *   *overloaded* (a 0-arg "select all columns" form and a generic
 *   fields-object form), and TypeScript collapses a union of two classes'
 *   overloaded methods down to only the shared non-generic signature —
 *   calling `db.select({ value: settings.value })` where `db` has this union
 *   type fails with "Expected 0 arguments, but got 1", even though both
 *   concrete classes individually accept it fine.
 *
 * What works: both driver classes are instantiations of the *same* generic
 * `BaseSQLiteDatabase<TResultKind, TRunResult, TSchema>` base — `Db` is
 * `BaseSQLiteDatabase<'async', SqliteRemoteResult, ...>`,
 * `BetterSQLite3Database` is `BaseSQLiteDatabase<'sync', RunResult, ...>`.
 * Naming that *one* shared class with both result kinds unioned into its
 * type arguments (rather than unioning two separate instantiations of it)
 * keeps `select`'s overloads intact — there is only one class here, so no
 * union-of-methods collapse — while still being a strict supertype either
 * concrete driver is assignable to. `Pick`ing off only the four builder
 * methods from that is what actually excludes run/all/get/values/batch/
 * transaction (`batch` isn't on the shared base at all — it's declared only
 * on `SqliteRemoteDatabase` itself — so it's excluded automatically).
 */
export type QueryDb = Pick<
  BaseSQLiteDatabase<'sync' | 'async', RunResult | SqliteRemoteResult, typeof schema>,
  'select' | 'insert' | 'update' | 'delete'
>;

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

/**
 * Runs `fn` inside a single exclusive SQLocal transaction. See the rule
 * documented on `Tx` above: `fn` must execute everything through the `tx`
 * it is given (`tx.exec`/`tx.all`), never by awaiting a query through the
 * module-level `db`. Doing so deadlocks — the transaction's exclusive lock
 * blocks the `db` query, and `fn` (holding that same lock open) blocks
 * waiting for `fn` to return — silently and forever, with no error and no
 * console output, which in the app means `#root` never renders.
 */
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
