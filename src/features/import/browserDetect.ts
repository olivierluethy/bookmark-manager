export type BrowserId =
  'chrome' | 'firefox' | 'brave' | 'edge' | 'safari' | 'arc' | 'opera' | 'unknown';

export type DetectSignals = {
  userAgent: string;
  brands?: { brand: string; version: string }[];
  isBrave?: boolean;
};

/**
 * PURE so it can be tested without a browser. Order matters: Brave and Edge
 * both ship Chrome-shaped user agents, so the specific probes run first, and
 * Safari is checked last because every WebKit UA contains "Safari".
 */
export function detectBrowser(signals: DetectSignals): BrowserId {
  if (signals.isBrave) return 'brave';

  const brands = (signals.brands ?? []).map((b) => b.brand.toLowerCase()).join(' ');
  if (brands.includes('brave')) return 'brave';
  if (brands.includes('edge')) return 'edge';
  if (brands.includes('opera')) return 'opera';

  const ua = signals.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\/|Opera/.test(ua)) return 'opera';
  if (/Arc\//.test(ua)) return 'arc';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  // Safari must come last: every WebKit UA contains "Safari".
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'safari';
  return 'unknown';
}

type NavigatorWithBrave = Navigator & { brave?: { isBrave: () => Promise<boolean> } };
type NavigatorWithUaData = Navigator & {
  userAgentData?: { brands: { brand: string; version: string }[] };
};

/** The only browser-touching function here — everything else stays pure and testable in Node. */
export async function readSignals(): Promise<DetectSignals> {
  const nav = navigator as NavigatorWithBrave & NavigatorWithUaData;
  let isBrave = false;
  try {
    isBrave = (await nav.brave?.isBrave()) ?? false;
  } catch {
    isBrave = false;
  }
  return { userAgent: nav.userAgent, brands: nav.userAgentData?.brands, isBrave };
}

export const EXPORT_STEPS: Record<
  BrowserId,
  { label: string; internalUrl?: string; steps: string[] }
> = {
  chrome: {
    label: 'Chrome',
    internalUrl: 'chrome://bookmarks',
    steps: [
      'Open the bookmark manager',
      'Click the ⋮ menu, top right',
      'Choose "Export bookmarks"',
    ],
  },
  brave: {
    label: 'Brave',
    internalUrl: 'brave://bookmarks',
    steps: [
      'Open the bookmark manager',
      'Click the ⋮ menu, top right',
      'Choose "Export bookmarks"',
    ],
  },
  edge: {
    label: 'Edge',
    internalUrl: 'edge://favorites',
    steps: ['Open the favorites manager', 'Click the ⋯ menu', 'Choose "Export favorites"'],
  },
  firefox: {
    label: 'Firefox',
    steps: [
      'Press Ctrl+Shift+O (Cmd+Shift+O on Mac) to open the Library',
      'Click "Import and Backup"',
      'Choose "Export Bookmarks to HTML…"',
    ],
  },
  safari: {
    label: 'Safari',
    steps: ['Open the File menu', 'Choose Export', 'Choose "Bookmarks…"'],
  },
  arc: {
    label: 'Arc',
    internalUrl: 'arc://bookmarks',
    steps: ['Open the bookmark manager', 'Use the menu to export bookmarks as HTML'],
  },
  opera: {
    label: 'Opera',
    internalUrl: 'opera://bookmarks',
    steps: ['Open the bookmark manager', 'Use the export option to save bookmarks as HTML'],
  },
  unknown: {
    label: 'your browser',
    steps: [
      "Open your browser's bookmark manager",
      'Look for an "Export" option',
      'Save the file as HTML',
    ],
  },
};
