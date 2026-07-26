import { createTestDb } from '@/db/testDb';
import { runMigrations } from '@/db/migrate';
import { seedSystemFolders } from '@/db/seed';
import type { Tx } from '@/db/client';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { normalizeUrl, siteOf, urlHash } from '@/lib/url';

export async function freshDb(): Promise<{
  db: BetterSQLite3Database<typeof schema>;
  tx: Tx;
  close: () => void;
}> {
  const handle = createTestDb();
  // `runMigrations` takes only `tx` — it reads the bookkeeping table itself
  // through the same `tx` it writes through (see src/db/migrate.ts).
  await runMigrations(handle.tx);
  await seedSystemFolders(handle.db, handle.tx);
  return handle;
}

/** Builds a bookmark row with the derived columns computed the same way import does. */
export async function makeBookmark(
  url: string,
  overrides: Partial<schema.NewBookmark> = {},
): Promise<schema.NewBookmark> {
  const normalized = normalizeUrl(url);
  const now = Math.floor(Date.now() / 1000);
  return {
    id: crypto.randomUUID(),
    folderId: null,
    url,
    normalizedUrl: normalized,
    urlHash: await urlHash(normalized),
    site: siteOf(url),
    title: url,
    tags: '[]',
    isPinned: false,
    addedAt: now,
    openCount: 0,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
