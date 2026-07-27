import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SortDir, SortKey } from '@/lib/sort';
import { applyClick, type ClickModifiers } from '@/features/library/selection';
import type { BookmarkFilter } from '@/db/repo/bookmarks';

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
  // Folder tree (Task 14)
  expandedFolders: Set<string>;
  activeFolderId: string | null;
  includeSubfolderCounts: boolean;
  // Selection (Task 15) — transient, never persisted
  selectedIds: Set<string>;
  anchorId: string | null;
  // Filters (Task 17) — transient, never persisted
  filter: BookmarkFilter;
  setSidebarWidth: (px: number) => void;
  setDetailWidth: (px: number) => void;
  toggleSidebar: () => void;
  toggleDetail: () => void;
  setViewMode: (v: ViewMode) => void;
  setDensity: (d: Density) => void;
  setSort: (key: SortKey, dir: SortDir) => void;
  toggleFolderExpanded: (id: string) => void;
  setActiveFolder: (id: string | null) => void;
  toggleSubfolderCounts: () => void;
  clickBookmark: (id: string, orderedIds: string[], mods: ClickModifiers) => void;
  clearSelection: () => void;
  selectAll: (orderedIds: string[]) => void;
  setFilter: (patch: Partial<BookmarkFilter>) => void;
  clearFilters: () => void;
  activeFilterCount: () => number;
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
  expandedFolders: new Set<string>(),
  activeFolderId: null,
  includeSubfolderCounts: true,
  selectedIds: new Set<string>(),
  anchorId: null,
  filter: {} as BookmarkFilter,
};

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      setSidebarWidth: (px) => set({ sidebarWidth: clamp(px) }),
      setDetailWidth: (px) => set({ detailWidth: clamp(px) }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleDetail: () => set((s) => ({ detailCollapsed: !s.detailCollapsed })),
      setViewMode: (viewMode) => set({ viewMode }),
      setDensity: (density) => set({ density }),
      setSort: (sortKey, sortDir) => set({ sortKey, sortDir }),
      toggleFolderExpanded: (id) =>
        set((s) => {
          const next = new Set(s.expandedFolders);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { expandedFolders: next };
        }),
      setActiveFolder: (activeFolderId) => set({ activeFolderId }),
      toggleSubfolderCounts: () =>
        set((s) => ({ includeSubfolderCounts: !s.includeSubfolderCounts })),
      clickBookmark: (id, orderedIds, mods) =>
        set((s) =>
          applyClick({ selectedIds: s.selectedIds, anchorId: s.anchorId }, id, orderedIds, mods),
        ),
      clearSelection: () => set({ selectedIds: new Set<string>(), anchorId: null }),
      selectAll: (orderedIds) => set({ selectedIds: new Set(orderedIds) }),
      setFilter: (patch) =>
        set((s) => {
          const next: BookmarkFilter = { ...s.filter, ...patch };
          // An explicit undefined means "remove this filter", not "store undefined".
          for (const key of Object.keys(patch) as (keyof BookmarkFilter)[]) {
            if (patch[key] === undefined) delete next[key];
          }
          return { filter: next };
        }),
      clearFilters: () => set({ filter: {} }),
      activeFilterCount: () =>
        Object.values(get().filter).filter((v) => v !== undefined && v !== false && v !== '')
          .length,
      resetForTest: () => set(INITIAL),
    }),
    {
      name: 'bookmarks.ui',
      // Only layout, view, sort, and folder-tree state survive a reload.
      // Selection and filters are deliberately transient, and `Set` is not
      // JSON-serializable so `expandedFolders` round-trips as an array.
      partialize: (s) => ({
        sidebarWidth: s.sidebarWidth,
        detailWidth: s.detailWidth,
        sidebarCollapsed: s.sidebarCollapsed,
        detailCollapsed: s.detailCollapsed,
        viewMode: s.viewMode,
        density: s.density,
        sortKey: s.sortKey,
        sortDir: s.sortDir,
        activeFolderId: s.activeFolderId,
        includeSubfolderCounts: s.includeSubfolderCounts,
        expandedFolders: [...s.expandedFolders],
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<UiState> & { expandedFolders?: string[] };
        return {
          ...current,
          ...saved,
          expandedFolders: new Set(saved.expandedFolders ?? []),
        };
      },
    },
  ),
);
