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
  close: () => void;
} {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  const tx: Tx = {
    exec: async (sql, params) => {
      sqlite.prepare(sql).run(...(params as never[]));
    },
  };
  return { db, tx, close: () => sqlite.close() };
}
