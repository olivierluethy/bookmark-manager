import type { Bookmark } from '@/db/schema';

type Props = {
  bookmark: Bookmark;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onOpen: () => void;
};

export function BookmarkCard({ bookmark, selected, onClick, onOpen }: Props) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onOpen}
      className={`flex cursor-pointer flex-col overflow-hidden rounded-[6px] border transition-colors duration-150 ${
        selected ? 'border-accent bg-accent/8' : 'border-line bg-surface hover:border-accent/50'
      }`}
    >
      <div className="flex h-24 items-center justify-center bg-bg">
        {bookmark.previewImage ? (
          <img src={bookmark.previewImage} alt="" className="h-full w-full object-cover" />
        ) : bookmark.faviconUrl ? (
          <img src={bookmark.faviconUrl} alt="" width={28} height={28} />
        ) : (
          <span aria-hidden className="font-display text-2xl text-muted">
            {bookmark.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm">{bookmark.title}</p>
        <p className="mt-1 truncate text-xs text-muted">{bookmark.site}</p>
      </div>
    </div>
  );
}
