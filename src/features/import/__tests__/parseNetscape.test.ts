import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { parseNetscape } from '@/features/import/parseNetscape';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'src/features/import/__fixtures__', name), 'utf8');

// linkedom stands in for the browser's DOMParser in Node.
const parse = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html') as unknown as Document;

describe('parseNetscape — Chrome export', () => {
  const result = parseNetscape(fixture('chrome.html'), parse);

  it('finds every bookmark', () => {
    expect(result.bookmarks.map((b) => b.title).sort()).toEqual([
      'Example',
      'React',
      'Vite',
      'esbuild',
    ]);
  });

  it('preserves arbitrary folder nesting depth', () => {
    const esbuild = result.bookmarks.find((b) => b.title === 'esbuild');
    expect(esbuild!.folderPath).toEqual(['Bookmarks bar', 'Dev', 'Tools']);
  });

  it('parses ADD_DATE as a unix second timestamp', () => {
    expect(result.bookmarks.find((b) => b.title === 'React')!.addedAt).toBe(1700000001);
  });

  it('captures the ICON data URI', () => {
    expect(result.bookmarks.find((b) => b.title === 'React')!.icon).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
  });

  it('flags the toolbar folder', () => {
    expect(result.folders.find((f) => f.path.join('/') === 'Bookmarks bar')!.isToolbar).toBe(true);
  });

  it('records no errors for a well-formed file', () => {
    expect(result.errors).toEqual([]);
  });
});

describe('parseNetscape — Firefox export', () => {
  const result = parseNetscape(fixture('firefox.html'), parse);

  it('skips place: pseudo-URLs', () => {
    expect(result.bookmarks.some((b) => b.url.startsWith('place:'))).toBe(false);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it('parses TAGS into an array', () => {
    expect(result.bookmarks.find((b) => b.title === 'MDN')!.tags).toEqual(['docs', 'web']);
  });

  it('attaches the <DD> description to the preceding bookmark', () => {
    expect(result.bookmarks.find((b) => b.title === 'MDN')!.description).toBe(
      'The Mozilla Developer Network',
    );
  });

  it('ignores <HR> separators without losing the bookmark after them', () => {
    expect(result.bookmarks.some((b) => b.title === 'Rust')).toBe(true);
  });
});

describe('parseNetscape — malformed input', () => {
  const result = parseNetscape(fixture('malformed.html'), parse);

  it('never throws and still returns the good bookmarks', () => {
    expect(result.bookmarks.map((b) => b.title)).toContain('Fine');
    expect(result.bookmarks.map((b) => b.title)).toContain('Also fine');
  });

  it('skips entries with a missing or empty href rather than importing junk', () => {
    expect(result.bookmarks.some((b) => b.title === 'No href at all')).toBe(false);
    expect(result.bookmarks.some((b) => b.title === 'Empty href')).toBe(false);
    expect(result.skipped).toBeGreaterThanOrEqual(2);
  });
});

describe('parseNetscape — degenerate input', () => {
  it('returns an empty result for an empty string', () => {
    const result = parseNetscape('', parse);
    expect(result.bookmarks).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns an empty result for HTML with no bookmarks', () => {
    expect(parseNetscape('<html><body><p>hi</p></body></html>', parse).bookmarks).toEqual([]);
  });
});
