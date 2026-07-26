import { eq, isNull, or, type SQL } from 'drizzle-orm';
import type { Db, Tx } from './client';
import { bookmarks, folders, type SystemKey } from './schema';

export const SYSTEM_FOLDERS: readonly {
  systemKey: SystemKey;
  name: string;
  sortOrder: number;
}[] = [
  { systemKey: 'unsorted', name: 'Unsorted', sortOrder: 0 },
  { systemKey: 'pinned', name: 'Pinned', sortOrder: 1 },
  { systemKey: 'trash', name: 'Trash', sortOrder: 2 },
];

/**
 * Idempotent: matches on systemKey, so an existing folder keeps its id and the
 * bookmarks pointing at it. Safe to call on every boot.
 *
 * The existence check below is what keeps this idempotent, not the
 * `folders_system_key_unq` partial unique index in the schema — that index is
 * a backstop against a bug elsewhere inserting a duplicate, not something
 * this function should ever hit (and, if it disagreed with this check, the
 * check would be the thing to fix, not a catch around the constraint error).
 */
export async function seedSystemFolders(db: Db, tx: Tx): Promise<void> {
  // Executed through `tx.all`, not `db`: this function runs inside
  // `transaction()` (see boot.ts), and a `db`-issued read from in there would
  // be an outside query on SQLocal's exclusive transaction connection —
  // blocking forever waiting for the very transaction it's nested inside to
  // finish. See the deadlock note on `Tx`/`transaction()` in `./client`.
  //
  // Written as hand-rolled SQL (matching `runMigrations`'s style) rather than
  // a Drizzle `.select({...}).toSQL()`: Drizzle's query builder only remaps
  // a result row's snake_case columns back to camelCase JS keys (here,
  // `system_key` -> `systemKey`) when *it* executes the query and runs its
  // own result mapping. `tx.all` executes raw SQL directly against the
  // driver, which returns rows keyed by the actual column name — so a
  // `.toSQL()`'d select naively read back through `.systemKey` would read
  // `undefined` off every row (this was caught by the idempotency tests
  // failing with a duplicate-key constraint violation, not silently).
  const existing = await tx.all<{ system_key: string }>(
    'SELECT system_key FROM folders WHERE is_system = 1',
    [],
  );
  const present = new Set(existing.map((r) => r.system_key));
  const now = Math.floor(Date.now() / 1000);

  for (const folder of SYSTEM_FOLDERS) {
    if (present.has(folder.systemKey)) continue;
    const built = db
      .insert(folders)
      .values({
        id: crypto.randomUUID(),
        parentId: null,
        name: folder.name,
        sortOrder: folder.sortOrder,
        isSystem: true,
        systemKey: folder.systemKey,
        createdAt: now,
        updatedAt: now,
      })
      .toSQL();
    await tx.exec(built.sql, built.params);
  }
}

/**
 * Reads through `db` directly — safe only because this is called *outside*
 * any `transaction()` callback (every current call site awaits it before or
 * after a transaction, never inside one). Calling this from inside a
 * `transaction()` callback would deadlock for the same reason documented on
 * `Tx`/`transaction()` in `./client`: it would be an outside-`db` read
 * competing with that transaction's exclusive lock. If a future caller ever
 * needs this data mid-transaction, give it a `tx`-based read instead of
 * calling this function from in there.
 */
export async function getSystemFolderId(db: Db, key: SystemKey): Promise<string> {
  const [row] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.systemKey, key))
    .limit(1);
  if (!row) throw new Error(`System folder "${key}" is missing — seeding did not run.`);
  return row.id;
}

/**
 * Matches bookmarks that are unsorted by either representation: a NULL
 * folder_id (what ON DELETE SET NULL produces when a folder is deleted) or a
 * folder_id explicitly set to the seeded Unsorted folder's id (what the
 * import path assigns). Every caller that needs "is this bookmark unsorted"
 * — the sidebar's Unsorted view, folder counts, future import logic — must
 * go through this helper rather than re-deriving the condition, so the two
 * representations can never silently drift apart again.
 */
export function unsortedFilter(unsortedId: string): SQL {
  // `or()` types as `SQL | undefined` because it accepts a variadic list that
  // could theoretically be empty; with two always-present conditions here it
  // never actually returns undefined.
  return or(isNull(bookmarks.folderId), eq(bookmarks.folderId, unsortedId)) as SQL;
}
