import type { Bookmark } from '@/db/schema';

type Props = {
  bookmark: Bookmark;
  selected: boolean;
  compact: boolean;
  onClick: (e: React.MouseEvent) => void;
  onOpen: () => void;
};

export function BookmarkRow({ bookmark, selected, compact, onClick, onOpen }: Props) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={onClick}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      className={`flex h-full cursor-pointer items-center gap-3 border-b border-line/60 px-4 transition-colors duration-150 ${
        selected ? 'bg-accent/12' : 'hover:bg-line/25'
      }`}
    >
      {bookmark.faviconUrl ? (
        // Imported ICON data URIs only — no network request is made here.
        <img
          src={bookmark.faviconUrl}
          alt=""
          width={16}
          height={16}
          className="shrink-0 rounded-[2px]"
        />
      ) : (
        <span aria-hidden className="h-4 w-4 shrink-0 rounded-[2px] bg-line" />
      )}

      <span className="min-w-0 flex-1 truncate text-sm">{bookmark.title}</span>

      {!compact && (
        <span className="hidden shrink-0 text-xs text-muted sm:block">{bookmark.site}</span>
      )}
    </div>
  );
}
