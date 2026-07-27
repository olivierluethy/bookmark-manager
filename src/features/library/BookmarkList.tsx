import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { db, transaction } from '@/db/client';
import { recordOpen } from '@/db/repo/bookmarks';
import { useUiStore } from '@/stores/ui';
import { useBookmarks } from './useBookmarks';
import { BookmarkRow } from './BookmarkRow';
import { BookmarkCard } from './BookmarkCard';

const ROW_HEIGHT = { comfortable: 48, compact: 32 } as const;

const CARD_MIN_WIDTH = 200;
const CARD_HEIGHT = 190;
const GRID_GAP = 12;

/** Tracks the container width so the column count reflows with the pane. */
function useColumnCount(ref: React.RefObject<HTMLDivElement | null>): number {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setColumns(Math.max(1, Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}

export function BookmarkList() {
  const parentRef = useRef<HTMLDivElement>(null);
  const { rows, loading } = useBookmarks();
  const { selectedIds, clickBookmark, density } = useUiStore();
  const viewMode = useUiStore((s) => s.viewMode);

  const orderedIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const size = ROW_HEIGHT[density];

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => size,
    overscan: 12,
  });

  const columns = useColumnCount(parentRef);
  const rowCount = Math.ceil(rows.length / columns);

  const gridVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT + GRID_GAP,
    overscan: 4,
  });

  const open = (url: string, id: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    void transaction((tx) => recordOpen(db, tx, id));
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="h-8 animate-pulse rounded-[4px] bg-line/50" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-display text-lg">Nothing here yet</p>
        <p className="max-w-sm text-sm text-muted">
          Import a bookmark export to fill this folder, or pick a different one in the sidebar.
        </p>
      </div>
    );
  }

  if (viewMode === 'cards') {
    return (
      <div ref={parentRef} className="h-full overflow-auto p-3">
        <div
          role="listbox"
          aria-label="Bookmarks"
          aria-multiselectable="true"
          style={{ height: gridVirtualizer.getTotalSize(), position: 'relative' }}
        >
          {gridVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * columns;
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: CARD_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gap: GRID_GAP,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {rows.slice(start, start + columns).map((bookmark) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    selected={selectedIds.has(bookmark.id)}
                    onClick={(e) =>
                      clickBookmark(bookmark.id, orderedIds, {
                        shift: e.shiftKey,
                        meta: e.metaKey || e.ctrlKey,
                      })
                    }
                    onOpen={() => open(bookmark.url, bookmark.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        role="listbox"
        aria-label="Bookmarks"
        aria-multiselectable="true"
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const bookmark = rows[item.index]!;
          return (
            <div
              key={bookmark.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: item.size,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <BookmarkRow
                bookmark={bookmark}
                selected={selectedIds.has(bookmark.id)}
                compact={density === 'compact'}
                onClick={(e) =>
                  clickBookmark(bookmark.id, orderedIds, {
                    shift: e.shiftKey,
                    meta: e.metaKey || e.ctrlKey,
                  })
                }
                onOpen={() => open(bookmark.url, bookmark.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
