import { useEffect, useState } from 'react';
import { detectBrowser, EXPORT_STEPS, readSignals, type BrowserId } from './browserDetect';

const ALL: BrowserId[] = [
  'chrome',
  'firefox',
  'brave',
  'edge',
  'safari',
  'arc',
  'opera',
  'unknown',
];

export function ExportInstructions() {
  const [detected, setDetected] = useState<BrowserId>('unknown');
  const [override, setOverride] = useState<BrowserId | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void readSignals().then((s) => setDetected(detectBrowser(s)));
  }, []);

  const id = override ?? detected;
  const guide = EXPORT_STEPS[id];

  return (
    <section className="rounded-[6px] border border-line bg-surface p-5">
      <h2 className="font-display text-lg">Export your bookmarks from {guide.label}</h2>
      <p className="mt-1 text-sm text-muted">
        A web page can&apos;t read your browser&apos;s bookmarks directly — no browser exposes that
        to websites. Export them to a file first, then drop it here.
      </p>

      {guide.internalUrl && (
        <div className="mt-4 flex items-center gap-2">
          <code className="rounded-[4px] bg-bg px-2 py-1 font-mono text-sm">
            {guide.internalUrl}
          </code>
          <button
            type="button"
            onClick={() => {
              const url = guide.internalUrl;
              if (!url) return;
              navigator.clipboard
                .writeText(url)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
                .catch(() => {
                  // Clipboard access can be denied (permissions, insecure context). Fail
                  // silently rather than leave the button stuck on "Copied" or throw.
                  setCopied(false);
                });
            }}
            className="rounded-[4px] border border-line px-2 py-1 text-xs text-muted transition-colors duration-150 hover:text-text"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <span className="text-xs text-muted">paste into a new tab</span>
        </div>
      )}

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <label className="mt-4 flex items-center gap-2 text-xs text-muted">
        Not your browser?
        <select
          value={id}
          onChange={(e) => setOverride(e.target.value as BrowserId)}
          className="rounded-[4px] border border-line bg-bg px-2 py-1 text-text"
        >
          {ALL.map((b) => (
            <option key={b} value={b}>
              {EXPORT_STEPS[b].label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
