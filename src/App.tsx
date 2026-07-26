import { AppShell } from '@/app/AppShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useUiStore } from '@/stores/ui';

function Toolbar() {
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
      <ThemeToggle />
    </header>
  );
}

export function App() {
  return (
    <AppShell
      sidebar={
        <nav className="p-4 text-sm text-muted" aria-label="Bookmark folders">
          Sidebar placeholder
        </nav>
      }
      main={
        <div className="flex h-full flex-col">
          <Toolbar />
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
  );
}
