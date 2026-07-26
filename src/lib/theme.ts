export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bookmarks.theme';
const MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

export function readStoredMode(raw: string | null): ThemeMode {
  return MODES.includes(raw as ThemeMode) ? (raw as ThemeMode) : 'system';
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

export function applyTheme(resolved: ResolvedTheme, root: HTMLElement): void {
  root.dataset.theme = resolved;
}

/**
 * Reads a key from localStorage, swallowing any exception (private-browsing,
 * storage disabled, etc.) and returning null on failure — mirrors the
 * try/catch guard used by the pre-paint inline script in index.html.
 */
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Writes a key to localStorage, swallowing any exception (private-browsing,
 * storage disabled, quota exceeded, etc.).
 */
export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — theme preference simply won't persist.
  }
}
