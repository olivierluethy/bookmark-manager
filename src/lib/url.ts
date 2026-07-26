import { getDomain } from 'tldts';

export const TRACKING_PARAMS: readonly string[] = [
  'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src',
  'igshid', 'si', 'spm', '_ga', 'yclid', 'msclkid',
];

function isTracking(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.includes(lower);
}

/**
 * Produces the comparison form of a URL. Never throws; unparseable input is
 * returned verbatim so a malformed bookmark still round-trips.
 * The caller must never write this over the original `url` column.
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }

  // Schemes with no authority component (mailto:, javascript:, data:, ...) have
  // an empty host and a non-hierarchical pathname (it doesn't start with '/').
  // `file:///home/x` also has an empty host but IS hierarchical, so it must not
  // be treated as opaque. Reconstructing `${protocol}//${host}${path}` for a
  // truly opaque URL would fabricate an authority that was never there (e.g.
  // `mailto:foo@example.com` -> `mailto://foo@example.com`), so we bail out
  // and return the input verbatim: there is nothing meaningful to normalize.
  const hasAuthority = u.host !== '' || u.pathname.startsWith('/');
  if (!hasAuthority) return raw;

  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  // http -> https for comparison only.
  if (u.protocol === 'http:') u.protocol = 'https:';

  for (const key of [...u.searchParams.keys()]) {
    if (isTracking(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();

  const path = u.pathname.replace(/\/+$/, '');
  const query = u.searchParams.toString();

  // Keep SPA-route fragments only when there is no real path (e.g. example.com/#/app).
  const isSpaRoute = u.hash.startsWith('#/') && path === '';
  const hash = isSpaRoute ? u.hash : '';

  // Credentials are preserved deliberately: `u.host` excludes userinfo, so
  // dropping it here would make `https://user:pass@example.com/a` and
  // `https://example.com/a` normalize (and hash) identically, silently
  // merging two distinct bookmarks.
  const authority = u.username
    ? `${u.username}${u.password ? `:${u.password}` : ''}@${u.host}`
    : u.host;

  // Note: percent-encoded unreserved characters are NOT canonicalized here,
  // so `/%7Euser` and `/~user` are treated as distinct paths. This is a known
  // limitation, not an oversight.
  return `${u.protocol}//${authority}${path}${query ? `?${query}` : ''}${hash}`;
}

/** eTLD+1 via the public suffix list. Returns '' when undeterminable. */
export function siteOf(raw: string): string {
  try {
    // allowPrivateDomains is deliberate: without it, every subdomain on a
    // PSL "private" entry collapses to that entry's registrable domain, so
    // all GitHub Pages users would collapse to the single site `github.io`
    // instead of each `user.github.io` being its own site for grouping
    // purposes. This applies to the whole PSL private section (also
    // *.herokuapp.com, *.blogspot.com, S3 buckets, etc.), not just github.io.
    return getDomain(new URL(raw).hostname, { allowPrivateDomains: true }) ?? '';
  } catch {
    return '';
  }
}

export async function urlHash(normalized: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Batched hashing for import; keeps the per-row await out of hot loops. */
export function hashMany(normalized: string[]): Promise<string[]> {
  return Promise.all(normalized.map(urlHash));
}
