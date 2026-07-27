import { useEffect, useState } from 'react';
import { and, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookmarks, type SourceBrowser } from '@/db/schema';
import { listImportBatches } from '@/db/repo/importBatches';

type Options = {
  sites: { value: string; count: number }[];
  tags: { value: string; count: number }[];
  browsers: string[];
  batches: { id: string; fileName: string }[];
};

const EMPTY: Options = { sites: [], tags: [], browsers: [], batches: [] };

export function useFilterOptions(): Options {
  const [options, setOptions] = useState<Options>(EMPTY);

  useEffect(() => {
    void (async () => {
      const siteRows = await db
        .select({ value: bookmarks.site, count: sql<number>`count(*)` })
        .from(bookmarks)
        .where(and(isNull(bookmarks.deletedAt), sql`${bookmarks.site} <> ''`))
        .groupBy(bookmarks.site)
        .orderBy(sql`count(*) desc`)
        .limit(200);

      const browserRows = await db
        .select({ value: bookmarks.sourceBrowser })
        .from(bookmarks)
        .where(isNull(bookmarks.deletedAt))
        .groupBy(bookmarks.sourceBrowser);

      // Tags are a JSON array in a text column, so they are counted in JS.
      // Only the tags column is read, not whole rows.
      const tagRows = await db
        .select({ tags: bookmarks.tags })
        .from(bookmarks)
        .where(and(isNull(bookmarks.deletedAt), sql`${bookmarks.tags} <> '[]'`));

      const tagCounts = new Map<string, number>();
      for (const row of tagRows) {
        try {
          for (const tag of JSON.parse(row.tags) as string[]) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        } catch {
          // A corrupt tags value must not break the filter list.
        }
      }

      setOptions({
        sites: siteRows,
        tags: [...tagCounts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 200),
        browsers: browserRows.map((r) => r.value).filter((v): v is SourceBrowser => v !== null),
        batches: (await listImportBatches(db)).map((b) => ({ id: b.id, fileName: b.fileName })),
      });
    })();
  }, []);

  return options;
}
