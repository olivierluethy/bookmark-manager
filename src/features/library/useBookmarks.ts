import { useCallback, useEffect, useState } from 'react';
import { db } from '@/db/client';
import { listBookmarks, type BookmarkFilter } from '@/db/repo/bookmarks';
import { useUiStore } from '@/stores/ui';
import type { Bookmark } from '@/db/schema';

export function useBookmarks() {
  const [rows, setRows] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const activeFolderId = useUiStore((s) => s.activeFolderId);
  const sortKey = useUiStore((s) => s.sortKey);
  const sortDir = useUiStore((s) => s.sortDir);
  const storeFilter = useUiStore((s) => s.filter);

  const reload = useCallback(async () => {
    setLoading(true);
    const filter: BookmarkFilter = {
      ...storeFilter,
      ...(activeFolderId ? { folderId: activeFolderId } : {}),
    };
    setRows(await listBookmarks(db, filter, { key: sortKey, dir: sortDir }));
    setLoading(false);
    // `storeFilter` is a stable reference between `setFilter` calls, so this
    // does not loop.
  }, [activeFolderId, sortKey, sortDir, storeFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, reload };
}
