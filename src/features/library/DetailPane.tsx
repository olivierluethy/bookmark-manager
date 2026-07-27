import { useEffect, useState } from 'react';
import { db } from '@/db/client';
import { listBookmarks } from '@/db/repo/bookmarks';
import { folderPath, listFolders } from '@/db/repo/folders';
import { normalizeUrl } from '@/lib/url';
import type { Bookmark } from '@/db/schema';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-3">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

export function DetailPane({ bookmark }: { bookmark: Bookmark | null }) {
  const [path, setPath] = useState<string[]>([]);
  const [sameSite, setSameSite] = useState<Bookmark[]>([]);

  useEffect(() => {
    if (!bookmark) {
      setPath([]);
      setSameSite([]);
      return;
    }
    void (async () => {
      const folders = await listFolders(db);
      setPath(bookmark.folderId ? folderPath(folders, bookmark.folderId) : []);
      const siblings = await listBookmarks(
        db,
        { site: bookmark.site },
        { key: 'title', dir: 'asc' },
      );
      setSameSite(siblings.filter((b) => b.id !== bookmark.id));
    })();
  }, [bookmark]);

  if (!bookmark) {
    return <div className="p-6 text-sm text-muted">Select a bookmark to see its details.</div>;
  }

  const normalized = normalizeUrl(bookmark.url);
  const tags = JSON.parse(bookmark.tags) as string[];

  return (
    <div className="p-5">
      <h2 className="font-display text-lg leading-snug">{bookmark.title}</h2>
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block truncate text-sm text-accent underline-offset-2 hover:underline"
      >
        {bookmark.url}
      </a>

      <dl className="mt-4">
        {normalized !== bookmark.url && (
          <Field label="Compared as">
            <code className="font-mono text-xs">{normalized}</code>
            <p className="mt-1 text-xs text-muted">
              Tracking parameters and formatting differences are ignored when checking for
              duplicates. Your original link is stored unchanged.
            </p>
          </Field>
        )}
        <Field label="Site">{bookmark.site || 'Unknown'}</Field>
        <Field label="Folder">{path.length > 0 ? path.join(' / ') : 'Unsorted'}</Field>
        <Field label="Added">{new Date(bookmark.addedAt * 1000).toLocaleDateString()}</Field>
        <Field label="Opened">
          {bookmark.openCount === 0
            ? 'Never'
            : `${bookmark.openCount}× — last ${new Date((bookmark.lastOpenedAt ?? 0) * 1000).toLocaleDateString()}`}
        </Field>
        <Field label="From">{bookmark.sourceBrowser ?? 'Unknown'}</Field>
        {tags.length > 0 && (
          <Field label="Tags">
            <span className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <span key={t} className="rounded-[4px] bg-line/60 px-1.5 py-0.5 text-xs">
                  {t}
                </span>
              ))}
            </span>
          </Field>
        )}
        {bookmark.description && <Field label="Description">{bookmark.description}</Field>}
      </dl>

      {sameSite.length > 0 && (
        <section className="mt-5 border-t border-line pt-4">
          <h3 className="text-xs uppercase tracking-wide text-muted">
            {sameSite.length} more on {bookmark.site}
          </h3>
          <ul className="mt-2 space-y-1">
            {sameSite.slice(0, 20).map((b) => (
              <li key={b.id} className="truncate text-sm">
                {b.title}
              </li>
            ))}
          </ul>
          {sameSite.length > 20 && (
            <p className="mt-2 text-xs text-muted">…and {sameSite.length - 20} more</p>
          )}
        </section>
      )}
    </div>
  );
}
