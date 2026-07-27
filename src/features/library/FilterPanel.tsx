import { useUiStore } from '@/stores/ui';
import type { BookmarkFilter } from '@/db/repo/bookmarks';
import { useFilterOptions } from './useFilterOptions';

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string | undefined) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className="max-w-40 rounded-[4px] border border-line bg-bg px-1.5 py-1 text-text"
      >
        <option value="">Any</option>
        {children}
      </select>
    </label>
  );
}

export function FilterPanel() {
  const { filter, setFilter, clearFilters, activeFilterCount } = useUiStore();
  const { sites, tags, browsers, batches } = useFilterOptions();
  const active = activeFilterCount();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <Select label="Site" value={filter.site ?? ''} onChange={(v) => setFilter({ site: v })}>
        {sites.map((s) => (
          <option key={s.value} value={s.value}>
            {s.value} ({s.count})
          </option>
        ))}
      </Select>

      <Select label="Tag" value={filter.tag ?? ''} onChange={(v) => setFilter({ tag: v })}>
        {tags.map((t) => (
          <option key={t.value} value={t.value}>
            {t.value} ({t.count})
          </option>
        ))}
      </Select>

      <Select
        label="From"
        value={filter.sourceBrowser ?? ''}
        onChange={(v) => setFilter({ sourceBrowser: v as BookmarkFilter['sourceBrowser'] })}
      >
        {browsers.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </Select>

      <Select
        label="Import"
        value={filter.importBatchId ?? ''}
        onChange={(v) => setFilter({ importBatchId: v })}
      >
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.fileName}
          </option>
        ))}
      </Select>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        Added before
        <input
          type="date"
          value={
            filter.addedBefore
              ? new Date(filter.addedBefore * 1000).toISOString().slice(0, 10)
              : ''
          }
          onChange={(e) =>
            setFilter({
              addedBefore: e.target.value
                ? Math.floor(new Date(e.target.value).getTime() / 1000)
                : undefined,
            })
          }
          className="rounded-[4px] border border-line bg-bg px-1.5 py-1 text-text"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={filter.untagged ?? false}
          onChange={(e) => setFilter({ untagged: e.target.checked || undefined })}
        />
        Untagged
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={filter.neverOpened ?? false}
          onChange={(e) => setFilter({ neverOpened: e.target.checked || undefined })}
        />
        Never opened
      </label>

      {active > 0 && (
        <button
          onClick={clearFilters}
          className="ml-auto rounded-[4px] border border-line px-2 py-1 text-xs transition-colors duration-150 hover:border-accent"
        >
          Clear {active} {active === 1 ? 'filter' : 'filters'}
        </button>
      )}
    </div>
  );
}
