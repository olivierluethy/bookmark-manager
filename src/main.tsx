import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { sql } from 'drizzle-orm';
import { App } from '@/App';
import { BootGuard } from '@/app/BootGuard';
import { checkEnvironment } from '@/db/environment';
import { runMigrations } from '@/db/migrate';
import '@/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

const root = createRoot(rootElement);

function renderApp() {
  root.render(
    <StrictMode>
      <BootGuard>
        <App />
      </BootGuard>
    </StrictMode>,
  );
}

function renderBootFailure(error: unknown) {
  // Mirrors BootGuard's failure card so an unexpected boot error (as opposed
  // to an unsupported-environment error, which BootGuard itself already
  // handles) still gets an intelligible screen instead of a blank page.
  const message = error instanceof Error ? error.message : String(error);
  root.render(
    <StrictMode>
      <div className="flex h-dvh items-center justify-center bg-bg p-8 text-text">
        <div className="max-w-lg rounded-[6px] border border-line bg-surface p-8">
          <h1 className="font-display text-2xl">The app failed to start</h1>
          <p className="mt-4 text-text">{message}</p>
          <p className="mt-3 text-sm text-muted">
            Try reloading the page. Your bookmarks are stored locally in this browser and are not at
            risk — nothing is written until startup finishes successfully.
          </p>
        </div>
      </div>
    </StrictMode>,
  );
}

/**
 * Two tabs can open a fresh database at the same moment and both observe an
 * empty `migrations` table, because SQLocal's own database-level Web Lock is
 * requested in 'shared' mode and does not serialize transactions across
 * tabs. An exclusive Web Lock around the migration sequence does. Guarded
 * defensively rather than assumed, since `navigator.locks` requires a secure
 * context.
 */
async function withMigrationLock<R>(fn: () => Promise<R>): Promise<R> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('bookmarks:migrate', { mode: 'exclusive' }, fn);
  }
  return fn();
}

async function boot() {
  const envResult = checkEnvironment();
  if (!envResult.ok) {
    // Nothing below this line — which imports and constructs SQLocal — ever
    // runs. `BootGuard` re-checks the environment itself and renders the
    // explanatory failure screen; `<App/>` never mounts underneath it.
    renderApp();
    return;
  }

  // Dynamic import, deliberately: `src/db/client.ts` constructs
  // `new SQLocalDrizzle(...)` at module scope, which (confirmed by reading
  // sqlocal's installed dist/client.js constructor) synchronously starts a
  // Web Worker as soon as the module is evaluated — a *static* import at the
  // top of this file would do that merely by being imported, before
  // `checkEnvironment()` above ever ran. That was exactly what made
  // BootGuard inert: on a browser missing Worker/OPFS/cross-origin
  // isolation, the worker construction/connection would throw or hang while
  // the guard's fallback screen never got a chance to render. Importing
  // client.ts only here, after the ok-path is confirmed, defers that side
  // effect until it's safe.
  const { db, transaction } = await import('@/db/client');

  await withMigrationLock(() => transaction((tx) => runMigrations(tx)));

  // TEMP: manual OPFS round-trip verification for Task 6, step 7. Remove this
  // block (and the two console.log calls) once a real browser has confirmed:
  //   1. the console lists folders, bookmarks, import_batches, settings, migrations
  //   2. a hard refresh does not re-run migrations (proves OPFS persisted)
  //   3. `foreign_keys` reports 1, not 0 (proves the per-connection pragma took effect)
  // These are best-effort diagnostics only — an odd query shape here must
  // never crash boot, since real migration/boot failures already surface above.
  await db
    .all(sql`SELECT name FROM sqlite_master WHERE type='table'`)
    .then((tables) => console.log('migrations ok', tables))
    .catch((err) => console.log('post-boot table check failed', err));
  await db
    .all(sql`PRAGMA foreign_keys`)
    .then((pragma) => console.log('foreign_keys =', pragma))
    .catch((err) => console.log('post-boot pragma check failed', err));

  renderApp();
}

boot().catch((error: unknown) => {
  renderBootFailure(error);
});
