import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { isNotNull } from 'drizzle-orm';

export type SystemKey = 'unsorted' | 'pinned' | 'trash';
export type SourceBrowser =
  'chrome' | 'firefox' | 'brave' | 'edge' | 'safari' | 'arc' | 'opera' | 'unknown';

export const folders = sqliteTable(
  'folders',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id').references((): AnySQLiteColumn => folders.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    systemKey: text('system_key').$type<SystemKey>(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('folders_parent_id_idx').on(t.parentId),
    uniqueIndex('folders_system_key_unq').on(t.systemKey).where(isNotNull(t.systemKey)),
  ],
);

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  fileName: text('file_name').notNull(),
  detectedBrowser: text('detected_browser').$type<SourceBrowser>().notNull(),
  totalParsed: integer('total_parsed').notNull(),
  imported: integer('imported').notNull(),
  skippedDuplicates: integer('skipped_duplicates').notNull(),
  importedAt: integer('imported_at').notNull(),
});

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    urlHash: text('url_hash').notNull(),
    site: text('site').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    faviconUrl: text('favicon_url'),
    previewImage: text('preview_image'),
    // JSON array of strings. Stored as text because SQLite has no array type.
    tags: text('tags').notNull().default('[]'),
    notes: text('notes'),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    addedAt: integer('added_at').notNull(),
    lastOpenedAt: integer('last_opened_at'),
    openCount: integer('open_count').notNull().default(0),
    deletedAt: integer('deleted_at'),
    sourceBrowser: text('source_browser').$type<SourceBrowser>(),
    importBatchId: text('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('bookmarks_url_hash_idx').on(t.urlHash),
    index('bookmarks_site_idx').on(t.site),
    index('bookmarks_folder_id_idx').on(t.folderId),
    index('bookmarks_deleted_at_idx').on(t.deletedAt),
  ],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
