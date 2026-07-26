import type { QueryDb, Tx } from './client';
import { runMigrations } from './migrate';
import { seedSystemFolders } from './seed';

/**
 * Owns the whole database boot sequence. `runMigrations` reads its own
 * bookkeeping through the Tx seam — do NOT reintroduce a caller-supplied
 * applied-set, which is what made migrations re-run in the browser while the
 * Node tests stayed green.
 *
 * Serialized with an exclusive Web Lock because SQLocal's own database lock is
 * requested in 'shared' mode and therefore does not stop two tabs racing the
 * first migration on a fresh database. `navigator.locks` requires a secure
 * context, so it is guarded defensively rather than assumed.
 */
export async function bootDatabase(
  db: QueryDb,
  transaction: <R>(fn: (tx: Tx) => Promise<R>) => Promise<R>,
): Promise<void> {
  const run = async () => {
    await transaction((tx) => runMigrations(tx));
    await transaction((tx) => seedSystemFolders(db, tx));
  };

  if (typeof navigator === 'undefined' || !navigator.locks) return run();
  return navigator.locks.request('bookmarks:migrate', { mode: 'exclusive' }, run);
}
