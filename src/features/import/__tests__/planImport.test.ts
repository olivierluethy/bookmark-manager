import { describe, expect, it } from 'vitest';
import { pathKey, planImport, stripExportRoots } from '@/features/import/planImport';
import type { ParsedFile } from '@/features/import/parseNetscape';

const EMPTY_EXISTING = { folderPathKeys: new Map<string, string>(), hashes: new Set<string>() };
const DEFAULTS = { placement: 'merge' as const, skipExactDuplicates: true, keepExportRoots: false };

function file(bookmarks: Partial<ParsedFile['bookmarks'][number]>[]): ParsedFile {
  return {
    bookmarks: bookmarks.map((b) => ({
      url: 'https://example.com', title: 'x', addedAt: null, lastModified: null,
      icon: null, tags: [], description: null, folderPath: [], ...b,
    })),
    folders: [], errors: [], skipped: 0,
  };
}

describe('stripExportRoots', () => {
  it('removes known browser roots', () => {
    expect(stripExportRoots(['Bookmarks bar', 'Dev'], false)).toEqual(['Dev']);
    expect(stripExportRoots(['Other bookmarks', 'Misc'], false)).toEqual(['Misc']);
    expect(stripExportRoots(['Bookmarks Menu', 'Reading'], false)).toEqual(['Reading']);
  });

  it('removes a toolbar folder even when its name is unrecognised', () => {
    expect(stripExportRoots(['Lesezeichen-Symbolleiste', 'Dev'], true)).toEqual(['Dev']);
  });

  it('leaves ordinary paths untouched', () => {
    expect(stripExportRoots(['Dev', 'Tools'], false)).toEqual(['Dev', 'Tools']);
  });

  it('yields an empty path for a bookmark sitting directly in a root', () => {
    expect(stripExportRoots(['Bookmarks bar'], false)).toEqual([]);
  });
});

describe('pathKey', () => {
  it('is case-insensitive', () => {
    expect(pathKey(['Dev', 'Tools'])).toBe(pathKey(['dev', 'TOOLS']));
  });

  it('distinguishes different depths', () => {
    expect(pathKey(['Dev', 'Tools'])).not.toBe(pathKey(['Dev']));
  });
});

describe('planImport', () => {
  it('classifies new bookmarks', async () => {
    const plan = await planImport(
      [{ fileName: 'a.html', parsed: file([{ url: 'https://react.dev' }]) }],
      EMPTY_EXISTING,
      DEFAULTS,
    );
    expect(plan.counts.newBookmarks).toBe(1);
    expect(plan.counts.duplicatesInDb).toBe(0);
  });

  it('detects duplicates already in the database', async () => {
    const first = await planImport(
      [{ fileName: 'a.html', parsed: file([{ url: 'https://react.dev' }]) }],
      EMPTY_EXISTING,
      DEFAULTS,
    );
    const hash = first.bookmarks[0]!.urlHash;

    const plan = await planImport(
      [{ fileName: 'a.html', parsed: file([{ url: 'https://react.dev' }]) }],
      { folderPathKeys: new Map(), hashes: new Set([hash]) },
      DEFAULTS,
    );
    expect(plan.counts.duplicatesInDb).toBe(1);
    expect(plan.bookmarks).toHaveLength(0);
  });

  it('detects duplicates within the imported files, including across files', async () => {
    const plan = await planImport(
      [
        { fileName: 'a.html', parsed: file([{ url: 'https://react.dev' }]) },
        { fileName: 'b.html', parsed: file([{ url: 'https://www.react.dev/' }]) },
      ],
      EMPTY_EXISTING,
      DEFAULTS,
    );
    // Both normalize to the same URL, so exactly one survives.
    expect(plan.counts.duplicatesInFile).toBe(1);
    expect(plan.bookmarks).toHaveLength(1);
  });

  it('keeps duplicates when skipExactDuplicates is off', async () => {
    const plan = await planImport(
      [{ fileName: 'a.html', parsed: file([{ url: 'https://a.dev' }, { url: 'https://a.dev' }]) }],
      EMPTY_EXISTING,
      { ...DEFAULTS, skipExactDuplicates: false },
    );
    expect(plan.bookmarks).toHaveLength(2);
  });

  it('is idempotent — importing the same file twice creates no second folder tree', async () => {
    const parsed = file([{ url: 'https://vite.dev', folderPath: ['Bookmarks bar', 'Dev'] }]);
    const first = await planImport([{ fileName: 'a.html', parsed }], EMPTY_EXISTING, DEFAULTS);
    expect(first.counts.foldersCreated).toBe(1);

    const existingFolders = new Map(first.folders.map((f) => [f.key, 'folder-id']));
    const second = await planImport(
      [{ fileName: 'a.html', parsed }],
      { folderPathKeys: existingFolders, hashes: new Set(first.bookmarks.map((b) => b.urlHash)) },
      DEFAULTS,
    );
    expect(second.counts.foldersCreated).toBe(0);
    expect(second.counts.foldersMerged).toBe(1);
    expect(second.bookmarks).toHaveLength(0);
  });

  it('flattens everything into no folder when placement is flatten', async () => {
    const plan = await planImport(
      [{ fileName: 'a.html', parsed: file([{ url: 'https://a.dev', folderPath: ['Bookmarks bar', 'Dev'] }]) }],
      EMPTY_EXISTING,
      { ...DEFAULTS, placement: 'flatten' },
    );
    expect(plan.folders).toHaveLength(0);
    expect(plan.bookmarks[0]!.folderPathKey).toBe('');
  });

  it('nests everything under a file-named folder when placement is newFolder', async () => {
    const plan = await planImport(
      [{ fileName: 'bookmarks_7_26_26.html', parsed: file([{ url: 'https://a.dev', folderPath: ['Bookmarks bar', 'Dev'] }]) }],
      EMPTY_EXISTING,
      { ...DEFAULTS, placement: 'newFolder' },
    );
    expect(plan.folders.some((f) => f.path[0] === 'bookmarks_7_26_26')).toBe(true);
    expect(plan.bookmarks[0]!.folderPathKey).toBe(pathKey(['bookmarks_7_26_26', 'Dev']));
  });

  it('keeps export roots when asked', async () => {
    const plan = await planImport(
      [{ fileName: 'a.html', parsed: file([{ url: 'https://a.dev', folderPath: ['Bookmarks bar', 'Dev'] }]) }],
      EMPTY_EXISTING,
      { ...DEFAULTS, keepExportRoots: true },
    );
    expect(plan.bookmarks[0]!.folderPathKey).toBe(pathKey(['Bookmarks bar', 'Dev']));
  });

  it('carries per-file parse errors through with their file name', async () => {
    const parsed: ParsedFile = { ...file([]), errors: ['boom'] };
    const plan = await planImport([{ fileName: 'bad.html', parsed }], EMPTY_EXISTING, DEFAULTS);
    expect(plan.errors).toEqual([{ fileName: 'bad.html', message: 'boom' }]);
  });

  it('falls back to now for a missing addedAt', async () => {
    const plan = await planImport(
      [{ fileName: 'a.html', parsed: file([{ url: 'https://a.dev', addedAt: null }]) }],
      EMPTY_EXISTING,
      DEFAULTS,
    );
    expect(plan.bookmarks[0]!.addedAt).toBeGreaterThan(0);
  });
});
