import { describe, expect, it } from 'vitest';
import { normalizeUrl, siteOf, urlHash } from '@/lib/url';

describe('normalizeUrl', () => {
  it('lowercases scheme and host but preserves path case', () => {
    expect(normalizeUrl('HTTPS://Example.COM/Path/To')).toBe('https://example.com/Path/To');
  });

  it('strips www and unifies http to https for comparison', () => {
    expect(normalizeUrl('http://www.example.com/a')).toBe('https://example.com/a');
  });

  it('removes the trailing slash but keeps a bare root usable', () => {
    expect(normalizeUrl('https://example.com/a/')).toBe('https://example.com/a');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });

  it('strips every tracking parameter', () => {
    expect(normalizeUrl('https://example.com/a?utm_source=x&utm_medium=y&id=7'))
      .toBe('https://example.com/a?id=7');
    expect(normalizeUrl('https://example.com/a?fbclid=1&gclid=2&msclkid=3'))
      .toBe('https://example.com/a');
  });

  it('sorts remaining query parameters alphabetically', () => {
    expect(normalizeUrl('https://example.com/a?z=1&a=2')).toBe('https://example.com/a?a=2&z=1');
  });

  it('drops the fragment', () => {
    expect(normalizeUrl('https://example.com/a#section')).toBe('https://example.com/a');
  });

  it('keeps a SPA-route fragment when the path is empty', () => {
    expect(normalizeUrl('https://example.com/#/dashboard')).toBe('https://example.com#/dashboard');
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });

  it('treats w3schools pages as distinct URLs', () => {
    // Same site, different pages: these must NOT normalize to the same value.
    expect(normalizeUrl('https://www.w3schools.com/html/default.asp'))
      .not.toBe(normalizeUrl('https://www.w3schools.com/html/tryit.asp'));
  });

  it('returns opaque-scheme URLs unchanged instead of fabricating an authority', () => {
    expect(normalizeUrl('mailto:foo@example.com')).toBe('mailto:foo@example.com');
    expect(normalizeUrl('javascript:void(0)')).toBe('javascript:void(0)');
    expect(normalizeUrl('data:text/html,<h1>hi</h1>')).toBe('data:text/html,<h1>hi</h1>');
  });

  it('still normalizes file URLs, which have an empty host but ARE hierarchical', () => {
    expect(normalizeUrl('file:///home/x')).toBe('file:///home/x');
    // Trailing-slash stripping still applies, proving this path goes through
    // full normalization rather than the opaque-scheme early return.
    expect(normalizeUrl('file:///home/x/')).toBe('file:///home/x');
  });

  it('preserves userinfo so credentialed and credential-free URLs do not collide', () => {
    const withCreds = normalizeUrl('https://user:pass@example.com/a');
    const withoutCreds = normalizeUrl('https://example.com/a');
    expect(withCreds).toContain('user:pass@');
    expect(withCreds).not.toBe(withoutCreds);
  });

  it('round-trips a username-only authority (no password)', () => {
    expect(normalizeUrl('https://user@example.com/a')).toBe('https://user@example.com/a');
  });
});

describe('siteOf', () => {
  it('extracts eTLD+1', () => {
    expect(siteOf('https://www.w3schools.com/html/default.asp')).toBe('w3schools.com');
    expect(siteOf('https://docs.github.com/en')).toBe('github.com');
  });

  it('respects multi-part public suffixes', () => {
    expect(siteOf('https://foo.co.uk/a')).toBe('foo.co.uk');
    expect(siteOf('https://user.github.io/repo')).toBe('user.github.io');
  });

  it('returns empty string for unparseable input', () => {
    expect(siteOf('not a url')).toBe('');
  });

  it('treats each github.io user as its own site (allowPrivateDomains)', () => {
    expect(siteOf('https://user.github.io/repo')).toBe('user.github.io');
    expect(siteOf('https://other.github.io/x')).not.toBe(siteOf('https://user.github.io/repo'));
  });
});

describe('urlHash', () => {
  it('is stable and differs per input', async () => {
    const a = await urlHash('https://example.com');
    const b = await urlHash('https://example.com');
    const c = await urlHash('https://example.org');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
