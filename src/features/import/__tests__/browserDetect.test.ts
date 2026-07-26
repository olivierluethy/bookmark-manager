import { describe, expect, it } from 'vitest';
import { detectBrowser, EXPORT_STEPS } from '@/features/import/browserDetect';

const CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const EDGE_UA = `${CHROME_UA} Edg/126.0.0.0`;
const OPERA_UA = `${CHROME_UA} OPR/110.0.0.0`;

describe('detectBrowser', () => {
  it('reports Brave as Brave, not Chrome', () => {
    // Brave ships a Chrome UA; only the navigator.brave probe distinguishes it.
    expect(detectBrowser({ userAgent: CHROME_UA, isBrave: true })).toBe('brave');
  });

  it('prefers client hint brands over the UA string', () => {
    expect(
      detectBrowser({
        userAgent: CHROME_UA,
        brands: [{ brand: 'Microsoft Edge', version: '126' }],
      }),
    ).toBe('edge');
  });

  it('detects Edge and Opera from their UA suffixes before falling back to Chrome', () => {
    expect(detectBrowser({ userAgent: EDGE_UA })).toBe('edge');
    expect(detectBrowser({ userAgent: OPERA_UA })).toBe('opera');
  });

  it('detects Chrome, Firefox, and Safari', () => {
    expect(detectBrowser({ userAgent: CHROME_UA })).toBe('chrome');
    expect(detectBrowser({ userAgent: FIREFOX_UA })).toBe('firefox');
    expect(detectBrowser({ userAgent: SAFARI_UA })).toBe('safari');
  });

  it('falls back to unknown', () => {
    expect(detectBrowser({ userAgent: 'something else' })).toBe('unknown');
  });
});

describe('EXPORT_STEPS', () => {
  it('covers every browser id', () => {
    for (const id of [
      'chrome',
      'firefox',
      'brave',
      'edge',
      'safari',
      'arc',
      'opera',
      'unknown',
    ] as const) {
      expect(EXPORT_STEPS[id].steps.length).toBeGreaterThan(0);
    }
  });

  it('gives the correct internal URL per chromium browser', () => {
    expect(EXPORT_STEPS.chrome.internalUrl).toBe('chrome://bookmarks');
    expect(EXPORT_STEPS.brave.internalUrl).toBe('brave://bookmarks');
    expect(EXPORT_STEPS.edge.internalUrl).toBe('edge://favorites');
  });

  it('gives no internal URL for browsers that have none', () => {
    expect(EXPORT_STEPS.firefox.internalUrl).toBeUndefined();
    expect(EXPORT_STEPS.safari.internalUrl).toBeUndefined();
  });
});
