import type { ImportPlan, PlanOptions, Placement } from './planImport';

type Props = {
  plan: ImportPlan;
  options: PlanOptions;
  onOptions: (next: PlanOptions) => void;
  onApply: () => void;
  onCancel: () => void;
};

const PLACEMENTS: { value: Placement; label: string; hint: string }[] = [
  { value: 'merge', label: 'Merge into my folders', hint: 'Match folders by name and path' },
  { value: 'newFolder', label: 'New folder per file', hint: 'Nest everything under the file name' },
  {
    value: 'flatten',
    label: 'Flatten into Unsorted',
    hint: 'Ignore the imported folder structure',
  },
];

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'accent' | 'muted' }) {
  return (
    <div className="rounded-[6px] border border-line bg-bg p-3">
      <div
        className={`font-display text-2xl tabular-nums ${
          tone === 'accent' ? 'text-accent' : tone === 'muted' ? 'text-muted' : ''
        }`}
      >
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

export function ImportPreview({ plan, options, onOptions, onApply, onCancel }: Props) {
  const { counts } = plan;
  const nothingNew = counts.newBookmarks === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Review before importing</h2>
        <p className="mt-1 text-sm text-muted">Nothing is saved until you press Import.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="New bookmarks"
          value={counts.newBookmarks}
          tone={nothingNew ? 'muted' : 'accent'}
        />
        <Stat label="Already in your library" value={counts.duplicatesInDb} />
        <Stat label="Duplicated in the files" value={counts.duplicatesInFile} />
        <Stat label="Skipped entries" value={counts.skipped} />
      </div>

      <p className="text-sm text-muted">
        {counts.foldersMerged.toLocaleString()} folder{counts.foldersMerged === 1 ? '' : 's'} merge
        into your existing tree, {counts.foldersCreated.toLocaleString()} will be created.
      </p>

      {nothingNew && plan.errors.length === 0 && (
        <p className="rounded-[6px] border border-line bg-bg p-3 text-sm text-muted">
          Every bookmark in this import is already in your library. There is nothing new to add —
          try a different file, or turn off "Skip exact duplicates" below to re-add them anyway.
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Where should these go?</legend>
        {PLACEMENTS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-2 rounded-[6px] border border-line p-3 transition-colors duration-150 has-checked:border-accent"
          >
            <input
              type="radio"
              name="placement"
              checked={options.placement === option.value}
              onChange={() => onOptions({ ...options, placement: option.value })}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="block text-sm">{option.label}</span>
              <span className="block text-xs text-muted">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={options.skipExactDuplicates}
            onChange={(e) => onOptions({ ...options, skipExactDuplicates: e.target.checked })}
            className="accent-accent"
          />
          Skip exact duplicates
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={options.keepExportRoots}
            onChange={(e) => onOptions({ ...options, keepExportRoots: e.target.checked })}
            className="accent-accent"
          />
          Keep browser export roots (&quot;Bookmarks bar&quot;, &quot;Other bookmarks&quot;)
        </label>
      </div>

      {plan.errors.length > 0 && (
        <details className="rounded-[6px] border border-line p-3">
          <summary className="cursor-pointer text-sm">
            {plan.errors.length} file {plan.errors.length === 1 ? 'issue' : 'issues'}
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {plan.errors.map((e, i) => (
              <li key={`${e.fileName}-${i}`}>
                <span className="font-mono">{e.fileName}</span>: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={nothingNew}
          className="rounded-[6px] bg-accent px-4 py-2 text-sm text-on-accent transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
        >
          Import {counts.newBookmarks.toLocaleString()} bookmark
          {counts.newBookmarks === 1 ? '' : 's'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[6px] border border-line px-4 py-2 text-sm transition-colors duration-150 hover:border-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
