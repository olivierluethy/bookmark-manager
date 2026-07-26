import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SortDir, SortKey } from '@/lib/sort';

export type ViewMode = 'list' | 'compact' | 'cards';
export type Density = 'comfortable' | 'compact';
// Sort types are defined in lib/sort.ts so the data layer can use them without
// depending on the UI store. Re-exported here for convenience.
export type { SortDir, SortKey } from '@/lib/sort';

export const PANE_MIN = 180;
export const PANE_MAX = 640;

const clamp = (px: number) => Math.min(PANE_MAX, Math.max(PANE_MIN, px));

type UiState = {
  sidebarWidth: number;
  detailWidth: number;
  sidebarCollapsed: boolean;
  detailCollapsed: boolean;
  viewMode: ViewMode;
  density: Density;
  sortKey: SortKey;
  sortDir: SortDir;
  setSidebarWidth: (px: number) => void;
  setDetailWidth: (px: number) => void;
  toggleSidebar: () => void;
  toggleDetail: () => void;
  setViewMode: (v: ViewMode) => void;
  setDensity: (d: Density) => void;
  setSort: (key: SortKey, dir: SortDir) => void;
  resetForTest: () => void;
};

const INITIAL = {
  sidebarWidth: 260,
  detailWidth: 340,
  sidebarCollapsed: false,
  detailCollapsed: false,
  viewMode: 'list' as ViewMode,
  density: 'comfortable' as Density,
  sortKey: 'addedAt' as SortKey,
  sortDir: 'desc' as SortDir,
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setSidebarWidth: (px) => set({ sidebarWidth: clamp(px) }),
      setDetailWidth: (px) => set({ detailWidth: clamp(px) }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleDetail: () => set((s) => ({ detailCollapsed: !s.detailCollapsed })),
      setViewMode: (viewMode) => set({ viewMode }),
      setDensity: (density) => set({ density }),
      setSort: (sortKey, sortDir) => set({ sortKey, sortDir }),
      resetForTest: () => set(INITIAL),
    }),
    { name: 'bookmarks.ui' },
  ),
);
