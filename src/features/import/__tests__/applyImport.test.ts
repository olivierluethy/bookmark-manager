import { describe, expect, it } from 'vitest';
import { freshDb } from '@/db/repo/__tests__/helpers';
import { applyImport } from '@/features/import/applyImport';
import { planImport, pathKey } from '@/features/import/planImport';
import { listBookmarks } from '@/db/repo/bookmarks';
import { listFolders, folderPath } from '@/db/repo/folders';
import { listImportBatches } from '@/db/repo/importBatches';
import type { ParsedFile } from '@/features/import/parseNetscape';
import type { Tx } from '@/db/client';

const OPTIONS = { placement: 'merge' as const, skipExactDuplicates: true, keepExportRoots: false };

function parsedFile(entries: { url: string; title: string; folderPath: string[] }[]): ParsedFile {
  return {
    bookmarks: entries.map((e) => ({
      url: e.url,
      title: e.title,
      addedAt: 1700000000,
      lastModified: null,
      icon: null,
      tags: [],
      description: null,
      folderPath: e.folderPath,
    })),
    folders: [],
    errors: [],
    skipped: 0,
  };
}

/** Runs a callback with the test Tx, mirroring the production transaction() shape. */
function makeTransaction(tx: Tx) {
  return <R>(fn: (t: Tx) => Promise<R>): Promise<R> => fn(tx);
}

describe('applyImport', () => {
  it('creates the folder tree and inserts bookmarks into the right folders', async () => {
    const { db, tx, close } = await freshDb();
    const plan = await planImport(
      [
        {
          fileName: 'chrome.html',
          parsed: parsedFile([
            {
              url: 'https://vite.dev',
              title: 'Vite',
              folderPath: ['Bookmarks bar', 'Dev', 'Tools'],
            },
          ]),
        },
      ],
      { folderPathKeys: new Map(), hashes: new Set() },
      OPTIONS,
    );

    const result = await applyImport(db, makeTransaction(tx), plan, {
      fileName: 'chrome.html',
      detectedBrowser: 'chrome',
      totalParsed: 1,
    });
    expect(result.inserted).toBe(1);

    const rows = await listFolders(db);
    const dev = rows.find((f) => f.name === 'Dev');
    const tools = rows.find((f) => f.name === 'Tools');
    expect(folderPath(rows, tools!.id)).toEqual(['Dev', 'Tools']);
    expect(dev).toBeDefined();

    const saved = await listBookmarks(db, {}, { key: 'title', dir: 'asc' });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.folderId).toBe(tools!.id);
    expect(saved[0]!.url).toBe('https://vite.dev');
    close();
  });

  it('records an import batch', async () => {
    const { db, tx, close } = await freshDb();
    const plan = await planImport(
      [
        {
          fileName: 'chrome.html',
          parsed: parsedFile([{ url: 'https://a.dev', title: 'A', folderPath: [] }]),
        },
      ],
      { folderPathKeys: new Map(), hashes: new Set() },
      OPTIONS,
    );
    await applyImport(db, makeTransaction(tx), plan, {
      fileName: 'chrome.html',
      detectedBrowser: 'chrome',
      totalParsed: 1,
    });

    const batches = await listImportBatches(db);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.fileName).toBe('chrome.html');
    expect(batches[0]!.imported).toBe(1);
    close();
  });

  it('puts rootless bookmarks in Unsorted', async () => {
    const { db, tx, close } = await freshDb();
    const plan = await planImport(
      [
        {
          fileName: 'a.html',
          parsed: parsedFile([{ url: 'https://a.dev', title: 'A', folderPath: ['Bookmarks bar'] }]),
        },
      ],
      { folderPathKeys: new Map(), hashes: new Set() },
      OPTIONS,
    );
    await applyImport(db, makeTransaction(tx), plan, {
      fileName: 'a.html',
      detectedBrowser: 'chrome',
      totalParsed: 1,
    });

    const rows = await listFolders(db);
    const unsorted = rows.find((f) => f.systemKey === 'unsorted');
    const saved = await listBookmarks(db, {}, { key: 'title', dir: 'asc' });
    expect(saved[0]!.folderId).toBe(unsorted!.id);
    close();
  });

  it('reuses an existing folder instead of creating a duplicate', async () => {
    const { db, tx, close } = await freshDb();
    const parsed = parsedFile([{ url: 'https://a.dev', title: 'A', folderPath: ['Dev'] }]);

    await applyImport(
      db,
      makeTransaction(tx),
      await planImport(
        [{ fileName: 'a.html', parsed }],
        { folderPathKeys: new Map(), hashes: new Set() },
        OPTIONS,
      ),
      { fileName: 'a.html', detectedBrowser: 'chrome', totalParsed: 1 },
    );

    const afterFirst = await listFolders(db);
    const devId = afterFirst.find((f) => f.name === 'Dev')!.id;

    await applyImport(
      db,
      makeTransaction(tx),
      await planImport(
        [
          {
            fileName: 'a.html',
            parsed: parsedFile([{ url: 'https://b.dev', title: 'B', folderPath: ['Dev'] }]),
          },
        ],
        { folderPathKeys: new Map([[pathKey(['Dev']), devId]]), hashes: new Set() },
        OPTIONS,
      ),
      { fileName: 'a.html', detectedBrowser: 'chrome', totalParsed: 1 },
    );

    const rows = await listFolders(db);
    expect(rows.filter((f) => f.name === 'Dev')).toHaveLength(1);
    close();
  });

  it('reports progress across chunk boundaries', async () => {
    const { db, tx, close } = await freshDb();
    const entries = Array.from({ length: 1100 }, (_, i) => ({
      url: `https://example.com/${i}`,
      title: `B${i}`,
      folderPath: [],
    }));
    const plan = await planImport(
      [{ fileName: 'big.html', parsed: parsedFile(entries) }],
      { folderPathKeys: new Map(), hashes: new Set() },
      OPTIONS,
    );

    const seen: number[] = [];
    const result = await applyImport(
      db,
      makeTransaction(tx),
      plan,
      { fileName: 'big.html', detectedBrowser: 'chrome', totalParsed: 1100 },
      (done) => seen.push(done),
    );

    expect(result.inserted).toBe(1100);
    expect(seen.at(-1)).toBe(1100);
    close();
  });
});
