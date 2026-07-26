// Test-only. OPFS does not exist in Node, so repository tests run the same
// schema and the same migration SQL against better-sqlite3.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import type { Tx } from './client';

export const DB_INSIDE_TRANSACTION_MESSAGE =
  'query executed through db inside a transaction — use tx';

/**
 * Wraps a prepared statement so any of its execute methods throw while
 * `isTransactionOpen()` is true. `.raw()` returns the same guarded proxy
 * (not the unwrapped statement `better-sqlite3` itself returns) so a
 * `stmt.raw().get(...)` chain — which is how Drizzle reads rows in raw mode
 * — stays guarded too.
 */
function guardStatement<T extends Database.Statement>(stmt: T, isTransactionOpen: () => boolean): T {
  const guard = <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      if (isTransactionOpen()) throw new Error(DB_INSIDE_TRANSACTION_MESSAGE);
      return fn(...args);
    };
  return new Proxy(stmt, {
    get(target, prop, receiver) {
      if (prop === 'run' || prop === 'all' || prop === 'get' || prop === 'iterate') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- better-sqlite3's Statement methods are heavily overloaded; binding them generically here would need to reproduce those overloads, which buys nothing over trusting the underlying method's own runtime signature.
        return guard((target[prop] as (...a: any[]) => unknown).bind(target));
      }
      if (prop === 'raw') {
        return (...args: [] | [boolean]) => {
          target.raw(...args);
          return receiver as T;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Wraps the raw `better-sqlite3` handle passed to Drizzle's `db` so every
 * statement it prepares is guarded (see `guardStatement`), and so
 * `.transaction`, `.exec`, and `.pragma` — the other three entry points on
 * `Database.prototype` that execute SQL immediately, without going through
 * `.prepare` first — throw the same way if called while a transaction is
 * open. `tx`/`transaction` below are built from the *unwrapped* `sqlite`
 * reference, never this one — only `db` executions are ever trapped.
 */
function guardDatabase(sqlite: Database.Database, isTransactionOpen: () => boolean): Database.Database {
  const guard = <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      if (isTransactionOpen()) throw new Error(DB_INSIDE_TRANSACTION_MESSAGE);
      return fn(...args);
    };
  return new Proxy(sqlite, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (...args: [string]) => guardStatement(target.prepare(...args), isTransactionOpen);
      }
      if (prop === 'exec' || prop === 'pragma' || prop === 'transaction') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- these three methods are heavily overloaded on better-sqlite3's Database type; binding them generically here would need to reproduce those overloads, which buys nothing over trusting the underlying method's own runtime signature.
        return guard((target[prop] as (...a: any[]) => unknown).bind(target));
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export function createTestDb(options?: {
  /**
   * Covers every immediate-execution entry point on the guarded `db`
   * connection: `.prepare(...).run/all/get/iterate` (including a
   * `.raw()`-chained call), and `.exec`, `.pragma`, `.transaction` called
   * directly on the connection. Any of these, called through the returned
   * `db` while a `transaction()` callback is in flight (between BEGIN and
   * COMMIT/ROLLBACK), throws `DB_INSIDE_TRANSACTION_MESSAGE` instead of
   * running.
   *
   * Defaults to `true`. This is how Node — which otherwise cannot reproduce
   * the browser deadlock, since `db` and `tx` share one unlocked connection
   * here — still catches the forbidden pattern that causes it: awaiting a
   * `db` query inside a `transaction()` callback. See the rule documented
   * on `Tx`/`transaction()` in `./client`. Pass `false` only for a test that
   * deliberately needs to demonstrate the violation the trap exists to
   * catch, or otherwise depends on the pre-trap, unguarded connection.
   */
  trapDbInTransaction?: boolean;
}): {
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

  let transactionOpen = false;
  const trapDbInTransaction = options?.trapDbInTransaction ?? true;
  const dbConnection = trapDbInTransaction ? guardDatabase(sqlite, () => transactionOpen) : sqlite;
  const db = drizzle(dbConnection, { schema });

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
    transactionOpen = true;
    try {
      const result = await fn(tx);
      sqlite.prepare('COMMIT').run();
      return result;
    } catch (err) {
      sqlite.prepare('ROLLBACK').run();
      throw err;
    } finally {
      transactionOpen = false;
    }
  };
  return { db, tx, transaction, close: () => sqlite.close() };
}
