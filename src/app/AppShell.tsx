import type { ReactNode } from 'react';
import { useUiStore } from '@/stores/ui';
import { PaneDivider } from '@/components/ResizablePanes';

type Props = { sidebar: ReactNode; main: ReactNode; detail: ReactNode };

export function AppShell({ sidebar, main, detail }: Props) {
  const {
    sidebarWidth,
    detailWidth,
    sidebarCollapsed,
    detailCollapsed,
    setSidebarWidth,
    setDetailWidth,
  } = useUiStore();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text">
      {!sidebarCollapsed && (
        <>
          <aside
            id="sidebar-pane"
            style={{ width: sidebarWidth }}
            className="shrink-0 overflow-y-auto border-r border-line bg-surface"
          >
            {sidebar}
          </aside>
          <PaneDivider
            ariaLabel="Resize sidebar"
            ariaControls="sidebar-pane"
            value={sidebarWidth}
            onChange={setSidebarWidth}
            side="left"
          />
        </>
      )}

      <main className="min-w-0 flex-1 overflow-hidden">{main}</main>

      {!detailCollapsed && (
        <>
          <PaneDivider
            ariaLabel="Resize detail pane"
            ariaControls="detail-pane"
            value={detailWidth}
            onChange={setDetailWidth}
            side="right"
          />
          <aside
            id="detail-pane"
            style={{ width: detailWidth }}
            className="shrink-0 overflow-y-auto border-l border-line bg-surface"
          >
            {detail}
          </aside>
        </>
      )}
    </div>
  );
}
