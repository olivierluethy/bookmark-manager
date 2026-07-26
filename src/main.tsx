import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { BootGuard } from '@/app/BootGuard';
import { checkEnvironment } from '@/db/environment';
import { bootDatabase } from '@/db/boot';
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

  await bootDatabase(db, transaction);

  renderApp();
}

boot().catch((error: unknown) => {
  renderBootFailure(error);
});
