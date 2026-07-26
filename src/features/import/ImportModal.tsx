import { useEffect, useId, useRef } from 'react';
import { ExportInstructions } from './ExportInstructions';
import { DropZone } from './DropZone';
import { ImportPreview } from './ImportPreview';
import { useImport } from './useImport';

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div role="status" aria-live="polite" className="py-4">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full bg-accent transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { stage, options, setOptions, ingest, apply, reset } = useImport();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Parsing and writing are short but non-instant; closing mid-flight would
  // orphan a worker/transaction with nothing showing for it, so the close
  // affordances (Escape, backdrop click, the × button) are disabled while busy.
  const busy = stage.kind === 'parsing' || stage.kind === 'writing';

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // The library view behind this modal read its data before the import ran
  // and has no live subscription to the database, so a full reload is the
  // simplest way to guarantee it reflects the newly-written rows. Accepted
  // for now — a shared read-invalidation mechanism would let this become an
  // in-place refetch instead, but that plumbing doesn't exist yet.
  const finishAndReload = () => {
    window.location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-text/40 p-4 backdrop-blur-sm motion-reduce:backdrop-blur-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[6px] border border-line bg-surface p-8 shadow-xl outline-none"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h1 id={titleId} className="font-display text-xl">
            Import bookmarks
          </h1>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close import dialog"
            className="rounded-[6px] p-1 text-muted transition-colors duration-150 hover:text-text disabled:pointer-events-none disabled:opacity-0"
          >
            ✕
          </button>
        </div>

        {stage.kind === 'idle' && (
          <div className="space-y-6">
            <ExportInstructions />
            <DropZone onFiles={(files) => void ingest(files)} />
          </div>
        )}

        {stage.kind === 'parsing' && (
          <Progress
            done={stage.done}
            total={stage.total}
            label={`Reading ${stage.fileName || 'your files'}…`}
          />
        )}

        {stage.kind === 'preview' && (
          <ImportPreview
            plan={stage.plan}
            options={options}
            onOptions={setOptions}
            onApply={() => void apply()}
            onCancel={reset}
          />
        )}

        {stage.kind === 'writing' && (
          <Progress done={stage.done} total={stage.total} label="Saving bookmarks…" />
        )}

        {stage.kind === 'done' && (
          <div className="space-y-4 py-6 text-center">
            <p className="font-display text-2xl">
              Imported {stage.inserted.toLocaleString()} bookmark{stage.inserted === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-muted">
              The library view needs to reload to pick up what just changed.
            </p>
            <button
              type="button"
              onClick={finishAndReload}
              className="rounded-[6px] bg-accent px-4 py-2 text-sm text-on-accent transition-opacity duration-150 hover:opacity-90"
            >
              View your library
            </button>
          </div>
        )}

        {stage.kind === 'error' && (
          <div className="space-y-3 rounded-[6px] border border-line bg-bg p-5" role="alert">
            <p className="font-display text-lg">The import didn&apos;t finish</p>
            <p className="text-sm text-muted">{stage.message}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-[6px] border border-line px-3 py-1.5 text-sm transition-colors duration-150 hover:border-accent"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[6px] px-3 py-1.5 text-sm text-muted transition-colors duration-150 hover:text-text"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
