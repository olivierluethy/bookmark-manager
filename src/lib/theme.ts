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
