// Test-only. OPFS does not exist in Node, so repository tests run the same
// schema and the same migration SQL against better-sqlite3.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import type { Tx } from './client';

export function createTestDb(): {
  db: BetterSQLite3Database<typeof schema>;
  tx: Tx;
  /**
   * Mirrors production's `transaction()` in `src/db/client.ts`: runs `fn`
   * inside a real BEGIN/COMMIT, ROLLBACK-ing (and rethrowing) on any throw.
   *
   * better-sqlite3's own `sqlite.transaction(fn)` wrapper requires a
   * *synchronous* callback, but `fn` here (and `runMigrations`, its only
   * caller today) is async — wrapping it would silently return before the
   * awaited work finished, which is worse than not wrapping at all. Explicit
   * BEGIN/COMMIT/ROLLBACK statements around the callback give the same
   * atomicity without that trap.
   */
  transaction: <R>(fn: (tx: Tx) => Promise<R>) => Promise<R>;
  close: () => void;
} {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  const tx: Tx = {
    exec: async (sql, params) => {
      sqlite.prepare(sql).run(...(params as never[]));
    },
    all: async <T extends Record<string, unknown>>(sql: string, params: unknown[]) => {
      return sqlite.prepare(sql).all(...(params as never[])) as T[];
    },
  };
  const transaction = async <R>(fn: (tx: Tx) => Promise<R>): Promise<R> => {
    sqlite.prepare('BEGIN').run();
    try {
      const result = await fn(tx);
      sqlite.prepare('COMMIT').run();
      return result;
    } catch (err) {
      sqlite.prepare('ROLLBACK').run();
      throw err;
    }
  };
  return { db, tx, transaction, close: () => sqlite.close() };
}
