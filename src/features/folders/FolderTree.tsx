import { useUiStore } from '@/stores/ui';
import type { FolderNode } from '@/db/repo/folders';
import { useFolders } from './useFolders';

function Row({ node, counts }: { node: FolderNode; counts: Map<string, number> }) {
  const { expandedFolders, activeFolderId, toggleFolderExpanded, setActiveFolder } = useUiStore();
  const expanded = expandedFolders.has(node.id);
  const hasChildren = node.children.length > 0;
  const active = activeFolderId === node.id;
  const count = counts.get(node.id) ?? 0;

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        onClick={() => setActiveFolder(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && hasChildren && !expanded) toggleFolderExpanded(node.id);
          else if (e.key === 'ArrowLeft' && hasChildren && expanded) toggleFolderExpanded(node.id);
          else if (e.key === 'Enter' || e.key === ' ') setActiveFolder(node.id);
          else return;
          e.preventDefault();
        }}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        className={`flex cursor-pointer items-center gap-1.5 rounded-[4px] py-1 pr-2 text-sm transition-colors duration-150 ${
          active ? 'bg-accent/12 text-accent' : 'hover:bg-line/40'
        }`}
      >
        {hasChildren ? (
          <button
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFolderExpanded(node.id);
            }}
            className="w-4 shrink-0 text-muted"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {node.icon && <span aria-hidden>{node.icon}</span>}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {count > 0 && <span className="shrink-0 text-xs tabular-nums text-muted">{count}</span>}
      </div>

      {hasChildren && expanded && (
        <ul role="group">
          {node.children.map((child) => (
            <Row key={child.id} node={child} counts={counts} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FolderTree() {
  const { tree, counts } = useFolders();
  const { includeSubfolderCounts, toggleSubfolderCounts, setActiveFolder, activeFolderId } =
    useUiStore();

  return (
    <nav className="p-2">
      <div
        role="treeitem"
        aria-selected={activeFolderId === null}
        tabIndex={0}
        onClick={() => setActiveFolder(null)}
        className={`mb-1 cursor-pointer rounded-[4px] px-2 py-1 text-sm ${
          activeFolderId === null ? 'bg-accent/12 text-accent' : 'hover:bg-line/40'
        }`}
      >
        All bookmarks
      </div>

      <ul role="tree" aria-label="Folders">
        {tree.map((node) => (
          <Row key={node.id} node={node} counts={counts} />
        ))}
      </ul>

      <label className="mt-3 flex items-center gap-2 px-2 text-xs text-muted">
        <input type="checkbox" checked={includeSubfolderCounts} onChange={toggleSubfolderCounts} />
        Count subfolders
      </label>
    </nav>
  );
}
