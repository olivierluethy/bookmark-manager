import { SQLocalDrizzle } from 'sqlocal/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

/**
 * Narrow write seam. SQLocal's TransactionHandle is NOT a Drizzle database —
 * it exposes only query/sql/batch — so statements are built with Drizzle for
 * type safety and executed here as raw SQL. This interface is also what lets
 * repositories be tested against better-sqlite3 in Node.
 */
export type Tx = { exec(sql: string, params: unknown[]): Promise<void> };

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
    };
    return fn(tx);
  });
}

/**
 * SQLocal needs a Worker, OPFS, and cross-origin isolation. Without isolation
 * the browser blocks OPFS and every write is silently discarded, so this must
 * fail loudly at boot rather than let the app appear to work.
 */
export function checkEnvironment(): { ok: true } | { ok: false; reason: string; fix: string } {
  if (typeof Worker === 'undefined') {
    return {
      ok: false,
      reason: 'This browser does not support Web Workers.',
      fix: 'Use a current version of Chrome, Edge, Firefox, Brave, or Safari.',
    };
  }
  if (!navigator.storage?.getDirectory) {
    return {
      ok: false,
      reason: 'This browser does not support the Origin Private File System.',
      fix: 'Use Chrome/Edge 108+, Firefox 111+, or Safari 17+.',
    };
  }
  if (!crossOriginIsolated) {
    return {
      ok: false,
      reason: 'This page is not cross-origin isolated, so the browser blocks database storage.',
      fix: 'Serve the app with the headers "Cross-Origin-Opener-Policy: same-origin" and "Cross-Origin-Embedder-Policy: credentialless".',
    };
  }
  return { ok: true };
}
