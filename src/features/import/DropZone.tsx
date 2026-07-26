import { useCallback, useEffect, useRef, useState } from 'react';

type Props = { onFiles: (files: { fileName: string; text: string }[]) => void };

const ACCEPTED = /\.(html?|htm)$/i;
const HAS_ANCHOR = /<\s*a\s[^>]*href/i;

/**
 * Covers all three input paths from the spec: full-window drag-and-drop,
 * click-to-pick, and Ctrl+V paste of raw bookmark HTML.
 *
 * The `dragover`/`drop` window listeners always call `preventDefault()`,
 * even when nothing here ends up dragging-active — that is the guard against
 * the browser's default behaviour of navigating to/opening a dropped file.
 */
export function DropZone({ onFiles }: Props) {
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFiles = useCallback(
    async (list: FileList | Iterable<File> | null) => {
      if (!list) return;
      const all = [...list];
      const accepted = all.filter((f) => ACCEPTED.test(f.name));
      if (accepted.length === 0) {
        setRejected(
          all.length === 1
            ? `"${all[0]!.name}" doesn't look like a bookmark export (.html).`
            : 'None of those files look like bookmark exports (.html).',
        );
        return;
      }
      setRejected(null);
      onFiles(
        await Promise.all(accepted.map(async (f) => ({ fileName: f.name, text: await f.text() }))),
      );
    },
    [onFiles],
  );

  // Full-window drop target so a file can be dropped anywhere over the modal,
  // not just on the button below.
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault();
    };
    const enter = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void readFiles(e.dataTransfer?.files ?? null);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [readFiles]);

  // Ctrl+V of raw bookmark HTML copied from somewhere. Only claimed when the
  // clipboard actually looks like bookmark markup, so pasting into any other
  // field on the page (now or later) keeps working normally.
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/html') || e.clipboardData?.getData('text/plain');
      if (text && HAS_ANCHOR.test(text)) {
        e.preventDefault();
        setRejected(null);
        onFiles([{ fileName: 'Pasted bookmarks.html', text }]);
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [onFiles]);

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-describedby="dropzone-hint"
        className="w-full rounded-[6px] border-2 border-dashed border-line bg-bg p-10 text-center transition-colors duration-150 hover:border-accent focus-visible:border-accent"
      >
        <span className="block font-display text-lg">Drop your bookmark files here</span>
        <span id="dropzone-hint" className="mt-1 block text-sm text-muted">
          or click to choose files, or paste bookmark HTML with Ctrl+V
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".html,.htm"
        className="sr-only"
        onChange={(e) => {
          void readFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {rejected && (
        <p role="alert" className="mt-3 text-sm text-accent">
          {rejected}
        </p>
      )}

      {dragging && (
        <div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-sm motion-reduce:backdrop-blur-none"
          aria-hidden="true"
        >
          <p className="rounded-[6px] border-2 border-dashed border-accent bg-surface px-8 py-6 font-display text-xl text-text">
            Release to import
          </p>
        </div>
      )}
    </div>
  );
}
