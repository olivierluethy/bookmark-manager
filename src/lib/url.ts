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

  return `${u.protocol}//${u.host}${path}${query ? `?${query}` : ''}${hash}`;
}

/** eTLD+1 via the public suffix list. Returns '' when undeterminable. */
export function siteOf(raw: string): string {
  try {
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
