import { lazy, Suspense, useState } from 'react';
import { AppShell } from '@/app/AppShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useUiStore } from '@/stores/ui';

// Lazy, deliberately: `ImportModal` (via `useImport`) reaches `@/db/client`,
// which constructs SQLocal and spawns a Worker as a side effect of being
// *imported*, not just used. `main.tsx` only reaches that module itself after
// `checkEnvironment()` passes and `boot()` has run — a static import here
// would pull it back into `App.tsx`'s eager module graph and defeat that
// guard. `React.lazy` defers the import until this modal is actually opened,
// by which point boot has long since succeeded.
const ImportModal = lazy(() =>
  import('@/features/import/ImportModal').then((m) => ({ default: m.ImportModal })),
);

function Toolbar({ onImport }: { onImport: () => void }) {
  const { sidebarCollapsed, detailCollapsed, toggleSidebar, toggleDetail } = useUiStore();

  return (
    <header className="flex items-center justify-between border-b border-line px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg">Bookmark</h1>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-pressed={sidebarCollapsed}
          className="rounded-[6px] border border-line px-2 py-1 text-xs text-muted transition-colors duration-150 hover:text-text"
        >
          {sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        </button>
        <button
          type="button"
          onClick={toggleDetail}
          aria-pressed={detailCollapsed}
          className="rounded-[6px] border border-line px-2 py-1 text-xs text-muted transition-colors duration-150 hover:text-text"
        >
          {detailCollapsed ? 'Show detail' : 'Hide detail'}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onImport}
          className="rounded-[6px] bg-accent px-3 py-1.5 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90"
        >
          Import bookmarks
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function App() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <AppShell
        sidebar={
          <nav className="p-4 text-sm text-muted" aria-label="Bookmark folders">
            Sidebar placeholder
          </nav>
        }
        main={
          <div className="flex h-full flex-col">
            <Toolbar onImport={() => setImportOpen(true)} />
            <div className="flex-1 overflow-y-auto p-4 text-sm text-muted">
              Bookmark list placeholder
            </div>
          </div>
        }
        detail={
          <div className="p-4 text-sm text-muted" aria-label="Bookmark detail">
            Detail placeholder
          </div>
        }
      />

      {importOpen && (
        <Suspense fallback={null}>
          <ImportModal onClose={() => setImportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
