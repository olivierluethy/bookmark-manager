import { useUiStore, type SortKey, type ViewMode, type Density } from '@/stores/ui';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'addedAt', label: 'Date added' },
  { value: 'title', label: 'Title' },
  { value: 'lastOpenedAt', label: 'Last opened' },
  { value: 'openCount', label: 'Times opened' },
  { value: 'site', label: 'Site' },
  { value: 'manual', label: 'Manual order' },
];

const VIEWS: ViewMode[] = ['list', 'compact', 'cards'];
const DENSITIES: Density[] = ['comfortable', 'compact'];

export function FilterBar({ count }: { count: number }) {
  const { sortKey, sortDir, setSort, viewMode, setViewMode, density, setDensity } = useUiStore();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-sm">
      <span className="tabular-nums text-muted">{count.toLocaleString()} bookmarks</span>

      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
        Sort
        <select
          value={sortKey}
          onChange={(e) => setSort(e.target.value as SortKey, sortDir)}
          className="rounded-[4px] border border-line bg-bg px-1.5 py-1 text-text"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <button
        onClick={() => setSort(sortKey, sortDir === 'asc' ? 'desc' : 'asc')}
        aria-label={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
        className="rounded-[4px] border border-line px-1.5 py-1 text-xs"
      >
        {sortDir === 'asc' ? '↑' : '↓'}
      </button>

      <div role="radiogroup" aria-label="View mode" className="flex gap-0.5">
        {VIEWS.map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={viewMode === v}
            onClick={() => setViewMode(v)}
            className={`rounded-[4px] px-2 py-1 text-xs capitalize ${
              viewMode === v ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <button
        onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
        className="rounded-[4px] border border-line px-2 py-1 text-xs capitalize"
      >
        {DENSITIES.find((d) => d !== density)}
      </button>
    </div>
  );
}
