import { useCallback, useEffect, useState } from 'react';
import { db } from '@/db/client';
import { buildTree, listFolders, type FolderNode } from '@/db/repo/folders';
import { countsByFolder, rollupCounts } from '@/db/repo/bookmarks';
import { useUiStore } from '@/stores/ui';
import type { Folder } from '@/db/schema';

export function useFolders() {
  const [rows, setRows] = useState<Folder[]>([]);
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const includeSubfolders = useUiStore((s) => s.includeSubfolderCounts);

  const reload = useCallback(async () => {
    const folders = await listFolders(db);
    const built = buildTree(folders);
    const direct = await countsByFolder(db);
    setRows(folders);
    setTree(built);
    setCounts(includeSubfolders ? rollupCounts(built, direct) : direct);
  }, [includeSubfolders]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { tree, rows, counts, reload };
}
