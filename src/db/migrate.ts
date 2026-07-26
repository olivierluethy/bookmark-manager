import type { Tx } from './client';

// Vite inlines every migration as a raw string at build time, so migrations
// ship with the bundle and need no network access.
const FILES = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const BOOKKEEPING_SQL = `CREATE TABLE IF NOT EXISTS migrations (
  id text PRIMARY KEY,
  hash text NOT NULL,
  applied_at integer NOT NULL
)`;

/** Cheap, stable, non-cryptographic hash — enough to detect an edited migration. */
export function hashSql(sql: string): string {
  let h = 2166136261;
  for (let i = 0; i < sql.length; i++) {
    h ^= sql.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function loadMigrations(): { id: string; sql: string }[] {
  return Object.entries(FILES)
    .map(([path, sql]) => ({ id: path.split('/').pop() ?? path, sql }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Splits a drizzle-kit file on its statement-breakpoint markers. */
export function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Applies every unapplied migration in filename order.
 *
 * The set of already-applied migrations is read from the `migrations`
 * bookkeeping table by this function itself, inside the same `tx` the caller
 * is about to write through — never supplied by the caller. Production
 * (SQLocal) and tests (better-sqlite3) both go through `Tx.all`, so there is
 * one code path for "what counts as applied," not a production path and a
 * separately-shaped test path. A hash mismatch on an already-applied
 * migration is a hard error, never a silent skip.
 */
export async function runMigrations(tx: Tx): Promise<string[]> {
  await tx.exec(BOOKKEEPING_SQL, []);

  const rows = await tx.all<{ id: string; hash: string }>('SELECT id, hash FROM migrations', []);
  const applied = new Map(rows.map((r) => [r.id, r.hash]));

  const ran: string[] = [];

  for (const { id, sql } of loadMigrations()) {
    const hash = hashSql(sql);
    const previous = applied.get(id);

    if (previous !== undefined) {
      if (previous !== hash) {
        throw new Error(
          `Migration ${id} was modified after it was applied (expected hash ${previous}, got ${hash}). ` +
            `Migrations are immutable once applied — add a new migration instead.`,
        );
      }
      continue;
    }

    for (const statement of splitStatements(sql)) {
      await tx.exec(statement, []);
    }
    await tx.exec('INSERT INTO migrations (id, hash, applied_at) VALUES (?, ?, ?)', [
      id,
      hash,
      Math.floor(Date.now() / 1000),
    ]);
    ran.push(id);
  }

  return ran;
}
