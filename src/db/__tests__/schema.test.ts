import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'src/db/migrations');
const sql = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n');

describe('generated migrations', () => {
  it('creates every table', () => {
    for (const table of ['folders', 'bookmarks', 'import_batches', 'settings']) {
      expect(sql).toContain(`CREATE TABLE \`${table}\``);
    }
  });

  it('creates all five required indexes', () => {
    for (const idx of [
      'bookmarks_url_hash_idx',
      'bookmarks_site_idx',
      'bookmarks_folder_id_idx',
      'bookmarks_deleted_at_idx',
      'folders_parent_id_idx',
    ]) {
      expect(sql).toContain(idx);
    }
  });
});
