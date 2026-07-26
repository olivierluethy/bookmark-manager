# Local-First Bookmark Manager — Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first bookmark manager that imports multiple browser bookmark HTML exports into browser-resident SQLite and browses them in a fast, virtualized, three-pane UI.

**Architecture:** Three pure, dependency-free cores (`parseNetscape`, `planImport`, `lib/url`) wrapped in thin shells — a Web Worker for parsing, Drizzle repositories for persistence, React for UI. Data lives in SQLite via SQLocal over OPFS. Every hard piece of logic is a pure function unit-testable in Node without a browser, worker, or database.

**Tech Stack:** React 19.2.8, Vite 8.1.5, TypeScript 5.x strict, Tailwind CSS 4.3.3, Drizzle ORM 0.45.2, SQLocal 0.18.0, @tanstack/react-virtual 3.14.8, zustand 5.0.14, tldts 7.4.9, Vitest 4.1.10, better-sqlite3 (dev only).

**Spec:** `docs/superpowers/specs/2026-07-26-bookmark-manager-milestone-1-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Package manager: `pnpm` only.** Commit `pnpm-lock.yaml`. Never generate `package-lock.json` or `yarn.lock`.
- **TypeScript strict mode.** No `any` without an inline comment justifying it.
- **Conventional Commits** for every commit (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).
- **Tailwind CSS v4 only.** No CSS-in-JS. No themed component libraries. Headless primitives are acceptable.
- **No network calls anywhere in Milestone 1.** No auth, no accounts, no telemetry, no CDN links (including fonts).
- **Offline-first:** every feature must work with the network cable unplugged.
- **Scale target: 20,000 bookmarks.** Virtualize long lists. No O(n²) work on the main thread.
- **Exact pinned versions:** `react@19.2.8`, `vite@8.1.5`, `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `sqlocal@0.18.0`, `@tanstack/react-virtual@3.14.8`, `zustand@5.0.14`, `tldts@7.4.9`, `vitest@4.1.10`.
- **Required response headers** (dev and prod): `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`.
- **The stored `bookmarks.url` is never mutated.** Normalization only ever writes `normalizedUrl`.
- **The parser never throws.** All problems become entries in a per-file error list.
- **Timestamps are integer unix seconds.** Primary keys are text UUIDs (`crypto.randomUUID()`).
- **Theme tokens (editorial / warm paper):**
  | Token | Light | Dark |
  |---|---|---|
  | `--color-bg` | `#FBF9F5` | `#17150F` |
  | `--color-surface` | `#FFFFFF` | `#201D16` |
  | `--color-text` | `#1F1B14` | `#EFE9DC` |
  | `--color-muted` | `#6B6355` | `#9A9081` |
  | `--color-line` | `#E5DED1` | `#332E24` |
  | `--color-accent` | `#B4552E` | `#B4552E` |
- **8px spacing grid, 6px radii, motion 120–200ms**, respecting `prefers-reduced-motion`.

---

## File Structure

| File | Responsibility |
|---|---|
| `vite.config.ts` | Vite + React + Tailwind + sqlocal plugins; COOP/COEP dev headers |
| `scripts/preview-server.mjs` | Static prod server that sets COOP/COEP |
| `src/lib/url.ts` | PURE: `normalizeUrl`, `urlHash`, `siteOf` |
| `src/lib/theme.ts` | PURE: three-state theme resolution |
| `src/db/schema.ts` | Drizzle schema, all tables + indexes |
| `src/db/client.ts` | SQLocalDrizzle singleton, `Db`/`Tx` types |
| `src/db/migrate.ts` | Migration runner + bookkeeping table |
| `src/db/seed.ts` | Idempotent system-folder seeding |
| `src/db/repo/folders.ts` | Folder reads/writes, tree assembly |
| `src/db/repo/bookmarks.ts` | Bookmark reads/writes, filtering, counts |
| `src/db/repo/settings.ts` | Key/value settings |
| `src/db/repo/importBatches.ts` | Import batch records |
| `src/features/import/parseNetscape.ts` | PURE: `string -> ParsedFile` |
| `src/features/import/browserDetect.ts` | PURE: navigator signals -> `BrowserId` |
| `src/features/import/planImport.ts` | PURE: `(ParsedFile[], ExistingTree, Options) -> ImportPlan` |
| `src/features/import/applyImport.ts` | Executes an `ImportPlan` against the DB |
| `src/workers/importWorker.ts` | Thin transport shell around `parseNetscape` |
| `src/stores/ui.ts` | zustand: selection, filters, sort, view, panes, density |
| `src/app/BootGuard.tsx` | Cross-origin isolation / OPFS / Worker checks |

---

## Phase 1 — Scaffold

### Task 1: Project scaffold, Tailwind theme, and COOP/COEP headers

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.gitignore`, `.prettierrc`, `eslint.config.js`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles.css`
- Create: `scripts/preview-server.mjs`
- Test: `src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working `pnpm dev` / `pnpm build` / `pnpm test`; the `@/` path alias resolving to `src/`; Tailwind theme tokens available as `bg-bg`, `text-text`, `border-line`, `bg-surface`, `text-muted`, `text-accent`

- [ ] **Step 1: Initialize the project and install exact versions**

```bash
pnpm init
pnpm add react@19.2.8 react-dom@19.2.8
pnpm add -D vite@8.1.5 @vitejs/plugin-react typescript @types/react @types/react-dom \
  tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 sqlocal@0.18.0 \
  vitest@4.1.10 @vitest/coverage-v8 prettier eslint typescript-eslint \
  eslint-plugin-react-hooks globals
```

Note: `sqlocal` is installed now because its Vite plugin is needed for Worker handling from the start.

- [ ] **Step 2: Write `tsconfig.json` with strict mode and the `@/` alias**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Write `vite.config.ts` with `credentialless` headers**

The `sqlocal` plugin is configured with `coi: false` because it sets `require-corp`, which would block cross-origin favicons and iframes. A custom plugin sets `credentialless` instead so dev matches production.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import sqlocal from 'sqlocal/vite';
import path from 'node:path';
import type { Plugin } from 'vite';

const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
} as const;

// sqlocal's own plugin sets COEP: require-corp, which blocks cross-origin
// favicons and iframes. We disable its header handling and set credentialless.
function crossOriginIsolation(): Plugin {
  return {
    name: 'app:cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        for (const [k, v] of Object.entries(COI_HEADERS)) res.setHeader(k, v);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        for (const [k, v] of Object.entries(COI_HEADERS)) res.setHeader(k, v);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sqlocal({ coi: false }), crossOriginIsolation()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

- [ ] **Step 4: Write `src/styles.css` with both theme scales**

```css
@import 'tailwindcss';

@theme {
  --color-bg: #FBF9F5;
  --color-surface: #FFFFFF;
  --color-text: #1F1B14;
  --color-muted: #6B6355;
  --color-line: #E5DED1;
  --color-accent: #B4552E;
  --radius-app: 6px;
  --font-display: 'Fraunces', ui-serif, Georgia, serif;
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

@layer theme {
  :root[data-theme='dark'] {
    --color-bg: #17150F;
    --color-surface: #201D16;
    --color-text: #EFE9DC;
    --color-muted: #9A9081;
    --color-line: #332E24;
    --color-accent: #B4552E;
  }
}

@layer base {
  html { color-scheme: light; }
  html[data-theme='dark'] { color-scheme: dark; }
  body {
    background-color: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-sans);
  }
  :focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

Note: the dark scale is applied via `data-theme="dark"` on `<html>`, set by `lib/theme.ts` in Task 2. `system` mode resolves to `light` or `dark` and sets the same attribute, so there is exactly one styling mechanism.

- [ ] **Step 5: Write `scripts/preview-server.mjs`**

```js
// Serves dist/ with the COOP/COEP headers SQLocal requires for OPFS.
// `vite preview` also sets them via the plugin; this exists for serving
// the built bundle without Vite.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');

  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(ROOT, safe);

  try {
    let body;
    try {
      body = await readFile(filePath);
    } catch {
      filePath = join(ROOT, 'index.html'); // SPA fallback
      body = await readFile(filePath);
    }
    res.setHeader('Content-Type', TYPES[extname(filePath)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
```

- [ ] **Step 6: Add scripts to `package.json`**

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "serve:dist": "node scripts/preview-server.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

- [ ] **Step 7: Write a smoke test that proves the test runner and alias work**

```ts
// src/lib/__tests__/smoke.test.ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Run the full toolchain and verify each command**

```bash
pnpm test
```
Expected: `1 passed`.

```bash
pnpm build
```
Expected: exits 0, produces `dist/index.html`.

```bash
pnpm dev
```
Expected: server starts. Open it, then in the browser console run `crossOriginIsolated`.
Expected: `true`. **If this prints `false`, stop — the header config is wrong and every
later task depends on it.**

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold vite + react + tailwind v4 with cross-origin isolation"
```

---

### Task 2: Theme system with three-state toggle

**Files:**
- Create: `src/lib/theme.ts`, `src/lib/__tests__/theme.test.ts`
- Create: `src/components/ThemeToggle.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `src/styles.css` theme tokens from Task 1
- Produces:
  ```ts
  type ThemeMode = 'light' | 'dark' | 'system';
  type ResolvedTheme = 'light' | 'dark';
  function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme;
  function applyTheme(resolved: ResolvedTheme, root: HTMLElement): void;
  function readStoredMode(raw: string | null): ThemeMode;   // defaults to 'system'
  const THEME_STORAGE_KEY = 'bookmarks.theme';
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/theme.test.ts
import { describe, expect, it } from 'vitest';
import { readStoredMode, resolveTheme } from '@/lib/theme';

describe('resolveTheme', () => {
  it('passes through explicit modes regardless of system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system preference in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('readStoredMode', () => {
  it('defaults to system when unset or invalid', () => {
    expect(readStoredMode(null)).toBe('system');
    expect(readStoredMode('purple')).toBe('system');
  });

  it('accepts the three valid modes', () => {
    expect(readStoredMode('light')).toBe('light');
    expect(readStoredMode('dark')).toBe('dark');
    expect(readStoredMode('system')).toBe('system');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/theme.test.ts`
Expected: FAIL — cannot resolve `@/lib/theme`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/theme.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/theme.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the pre-paint theme script to `index.html`**

This runs before React mounts, so there is no flash of the wrong theme.

```html
<script>
  (function () {
    try {
      var raw = localStorage.getItem('bookmarks.theme');
      var mode = raw === 'light' || raw === 'dark' ? raw : 'system';
      var dark = mode === 'dark' ||
        (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    } catch (e) { /* storage disabled — fall back to light */ }
  })();
</script>
```

- [ ] **Step 6: Write `src/components/ThemeToggle.tsx`**

```tsx
import { useEffect, useState } from 'react';
import {
  applyTheme, readStoredMode, resolveTheme, THEME_STORAGE_KEY,
  type ThemeMode,
} from '@/lib/theme';

const OPTIONS: readonly ThemeMode[] = ['light', 'system', 'dark'];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() =>
    readStoredMode(localStorage.getItem(THEME_STORAGE_KEY)),
  );

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => applyTheme(resolveTheme(mode, mq.matches), document.documentElement);
    sync();
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    // Only 'system' needs to react to OS changes, but subscribing always is simpler
    // and harmless.
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [mode]);

  return (
    <div role="radiogroup" aria-label="Color theme" className="inline-flex gap-0.5 rounded-[6px] border border-line p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option}
          role="radio"
          aria-checked={mode === option}
          onClick={() => setMode(option)}
          className={`rounded-[4px] px-2 py-1 text-xs capitalize transition-colors duration-150 ${
            mode === option ? 'bg-accent text-white' : 'text-muted hover:text-text'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Render the toggle in `src/App.tsx` and verify both themes by eye**

Run `pnpm dev`, click through all three states. Confirm: `light` and `dark` visibly
differ, `system` follows the OS setting, and the choice survives a hard refresh with no
flash of the wrong theme.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add three-state theme system with pre-paint flash prevention"
```

---

### Task 3: App shell with resizable, collapsible, persisted panes

**Files:**
- Create: `src/lib/sort.ts`, `src/stores/ui.ts`, `src/app/AppShell.tsx`, `src/components/ResizablePanes.tsx`
- Create: `src/stores/__tests__/ui.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` from Task 2
- Produces:
  ```ts
  type ViewMode = 'list' | 'compact' | 'cards';
  type Density = 'comfortable' | 'compact';
  type SortKey = 'title' | 'addedAt' | 'lastOpenedAt' | 'openCount' | 'site' | 'manual';

  type UiState = {
    sidebarWidth: number; detailWidth: number;
    sidebarCollapsed: boolean; detailCollapsed: boolean;
    viewMode: ViewMode; density: Density;
    sortKey: SortKey; sortDir: 'asc' | 'desc';
    selectedIds: Set<string>; anchorId: string | null;
    setSidebarWidth(px: number): void;
    toggleSidebar(): void; toggleDetail(): void;
    setViewMode(v: ViewMode): void; setDensity(d: Density): void;
    setSort(key: SortKey, dir: 'asc' | 'desc'): void;
  };
  const useUiStore: UseBoundStore<StoreApi<UiState>>;
  ```
  Selection actions (`selectOne`, `toggleSelect`, `selectRange`, `clearSelection`) are
  added in Task 12; this task ships only layout and view state.

- [ ] **Step 1: Install zustand and write `src/lib/sort.ts`**

```bash
pnpm add zustand@5.0.14
```

Sort types live in `lib/` rather than the store so that `db/repo/bookmarks.ts` can
consume them without the data layer importing UI state.

```ts
// src/lib/sort.ts
export type SortKey = 'title' | 'addedAt' | 'lastOpenedAt' | 'openCount' | 'site' | 'manual';
export type SortDir = 'asc' | 'desc';
```

- [ ] **Step 2: Write the failing test**

```ts
// src/stores/__tests__/ui.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore, PANE_MIN, PANE_MAX } from '@/stores/ui';

describe('ui store layout', () => {
  beforeEach(() => useUiStore.getState().resetForTest());

  it('clamps pane widths to the allowed range', () => {
    useUiStore.getState().setSidebarWidth(10);
    expect(useUiStore.getState().sidebarWidth).toBe(PANE_MIN);

    useUiStore.getState().setSidebarWidth(9999);
    expect(useUiStore.getState().sidebarWidth).toBe(PANE_MAX);
  });

  it('toggles pane collapse independently', () => {
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(useUiStore.getState().detailCollapsed).toBe(false);
  });

  it('defaults to comfortable density and list view', () => {
    expect(useUiStore.getState().density).toBe('comfortable');
    expect(useUiStore.getState().viewMode).toBe('list');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/stores/__tests__/ui.test.ts`
Expected: FAIL — cannot resolve `@/stores/ui`.

- [ ] **Step 4: Write the implementation**

Layout state persists to `localStorage` via zustand's `persist` middleware. Bookmark data
never goes here — that lives in SQLite.

```ts
// src/stores/ui.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'list' | 'compact' | 'cards';
export type Density = 'comfortable' | 'compact';
// Sort types are defined in lib/sort.ts so the data layer can use them without
// depending on the UI store. Re-exported here for convenience.
export type { SortDir, SortKey } from '@/lib/sort';
import type { SortDir, SortKey } from '@/lib/sort';

export const PANE_MIN = 180;
export const PANE_MAX = 640;

const clamp = (px: number) => Math.min(PANE_MAX, Math.max(PANE_MIN, px));

type UiState = {
  sidebarWidth: number;
  detailWidth: number;
  sidebarCollapsed: boolean;
  detailCollapsed: boolean;
  viewMode: ViewMode;
  density: Density;
  sortKey: SortKey;
  sortDir: SortDir;
  setSidebarWidth: (px: number) => void;
  setDetailWidth: (px: number) => void;
  toggleSidebar: () => void;
  toggleDetail: () => void;
  setViewMode: (v: ViewMode) => void;
  setDensity: (d: Density) => void;
  setSort: (key: SortKey, dir: SortDir) => void;
  resetForTest: () => void;
};

const INITIAL = {
  sidebarWidth: 260,
  detailWidth: 340,
  sidebarCollapsed: false,
  detailCollapsed: false,
  viewMode: 'list' as ViewMode,
  density: 'comfortable' as Density,
  sortKey: 'addedAt' as SortKey,
  sortDir: 'desc' as SortDir,
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setSidebarWidth: (px) => set({ sidebarWidth: clamp(px) }),
      setDetailWidth: (px) => set({ detailWidth: clamp(px) }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleDetail: () => set((s) => ({ detailCollapsed: !s.detailCollapsed })),
      setViewMode: (viewMode) => set({ viewMode }),
      setDensity: (density) => set({ density }),
      setSort: (sortKey, sortDir) => set({ sortKey, sortDir }),
      resetForTest: () => set(INITIAL),
    }),
    { name: 'bookmarks.ui' },
  ),
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/stores/__tests__/ui.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write `src/components/ResizablePanes.tsx`**

Pointer-events based dividers with keyboard support, correct ARIA, and no layout
thrash — width lives in the store, the divider only writes on pointer move.

```tsx
import { useCallback, useRef } from 'react';

type DividerProps = {
  ariaLabel: string;
  value: number;
  onChange: (px: number) => void;
  /** 'left' when the resized pane is left of the divider. */
  side: 'left' | 'right';
};

export function PaneDivider({ ariaLabel, value, onChange, side }: DividerProps) {
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const parent = e.currentTarget.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      onChange(side === 'left' ? e.clientX - rect.left : rect.right - e.clientX);
    },
    [onChange, side],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 48 : 16;
      if (e.key === 'ArrowLeft') onChange(value + (side === 'left' ? -step : step));
      else if (e.key === 'ArrowRight') onChange(value + (side === 'left' ? step : -step));
      else return;
      e.preventDefault();
    },
    [onChange, side, value],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className="w-1 shrink-0 cursor-col-resize bg-line/60 transition-colors duration-150 hover:bg-accent focus-visible:bg-accent"
    />
  );
}
```

- [ ] **Step 7: Write `src/app/AppShell.tsx`**

```tsx
import type { ReactNode } from 'react';
import { useUiStore } from '@/stores/ui';
import { PaneDivider } from '@/components/ResizablePanes';

type Props = { sidebar: ReactNode; main: ReactNode; detail: ReactNode };

export function AppShell({ sidebar, main, detail }: Props) {
  const {
    sidebarWidth, detailWidth, sidebarCollapsed, detailCollapsed,
    setSidebarWidth, setDetailWidth,
  } = useUiStore();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text">
      {!sidebarCollapsed && (
        <>
          <aside style={{ width: sidebarWidth }} className="shrink-0 overflow-y-auto border-r border-line bg-surface">
            {sidebar}
          </aside>
          <PaneDivider ariaLabel="Resize sidebar" value={sidebarWidth} onChange={setSidebarWidth} side="left" />
        </>
      )}

      <main className="min-w-0 flex-1 overflow-hidden">{main}</main>

      {!detailCollapsed && (
        <>
          <PaneDivider ariaLabel="Resize detail pane" value={detailWidth} onChange={setDetailWidth} side="right" />
          <aside style={{ width: detailWidth }} className="shrink-0 overflow-y-auto border-l border-line bg-surface">
            {detail}
          </aside>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Wire it into `App.tsx` with placeholder content and verify persistence**

Run `pnpm dev`. Drag both dividers, collapse and expand each pane, then hard-refresh.
Expected: widths and collapse states are exactly as left. Tab to a divider and press
arrow keys — it resizes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add resizable three-pane app shell with persisted layout"
```

---

## Phase 2 — Data Layer

### Task 4: URL normalization, hashing, and site extraction

**Files:**
- Create: `src/lib/url.ts`, `src/lib/__tests__/url.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  function normalizeUrl(raw: string): string;      // never throws; returns raw on parse failure
  function siteOf(raw: string): string;            // eTLD+1, or '' when undeterminable
  function urlHash(normalized: string): Promise<string>;  // sha-256 hex
  function hashMany(normalized: string[]): Promise<string[]>;
  const TRACKING_PARAMS: readonly string[];
  ```

- [ ] **Step 1: Install tldts**

```bash
pnpm add tldts@7.4.9
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/__tests__/url.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/url.test.ts`
Expected: FAIL — cannot resolve `@/lib/url`.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/url.ts
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
    return getDomain(new URL(raw).hostname) ?? '';
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/url.test.ts`
Expected: PASS, 13 tests.

Note: `crypto.subtle` exists in Node 20+ under Vitest's node environment, so no polyfill
is needed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add URL normalization, hashing, and eTLD+1 extraction"
```

---

### Task 5: Drizzle schema and generated migrations

**Files:**
- Create: `src/db/schema.ts`, `drizzle.config.ts`
- Create: `src/db/migrations/0000_*.sql` (generated)
- Test: `src/db/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export const folders, bookmarks, importBatches, settings;
  export type Folder = typeof folders.$inferSelect;
  export type NewFolder = typeof folders.$inferInsert;
  export type Bookmark = typeof bookmarks.$inferSelect;
  export type NewBookmark = typeof bookmarks.$inferInsert;
  export type ImportBatch = typeof importBatches.$inferSelect;
  export type SystemKey = 'unsorted' | 'pinned' | 'trash';
  export type SourceBrowser = 'chrome'|'firefox'|'brave'|'edge'|'safari'|'arc'|'opera'|'unknown';
  ```

- [ ] **Step 1: Install Drizzle and the test driver**

```bash
pnpm add drizzle-orm@0.45.2
pnpm add -D drizzle-kit@0.31.10 better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 2: Write `src/db/schema.ts`**

```ts
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export type SystemKey = 'unsorted' | 'pinned' | 'trash';
export type SourceBrowser =
  | 'chrome' | 'firefox' | 'brave' | 'edge' | 'safari' | 'arc' | 'opera' | 'unknown';

export const folders = sqliteTable(
  'folders',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id').references((): AnySQLiteColumn => folders.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    systemKey: text('system_key').$type<SystemKey>(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('folders_parent_id_idx').on(t.parentId)],
);

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  fileName: text('file_name').notNull(),
  detectedBrowser: text('detected_browser').$type<SourceBrowser>().notNull(),
  totalParsed: integer('total_parsed').notNull(),
  imported: integer('imported').notNull(),
  skippedDuplicates: integer('skipped_duplicates').notNull(),
  importedAt: integer('imported_at').notNull(),
});

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    urlHash: text('url_hash').notNull(),
    site: text('site').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    faviconUrl: text('favicon_url'),
    previewImage: text('preview_image'),
    // JSON array of strings. Stored as text because SQLite has no array type.
    tags: text('tags').notNull().default('[]'),
    notes: text('notes'),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    addedAt: integer('added_at').notNull(),
    lastOpenedAt: integer('last_opened_at'),
    openCount: integer('open_count').notNull().default(0),
    deletedAt: integer('deleted_at'),
    sourceBrowser: text('source_browser').$type<SourceBrowser>(),
    importBatchId: text('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('bookmarks_url_hash_idx').on(t.urlHash),
    index('bookmarks_site_idx').on(t.site),
    index('bookmarks_folder_id_idx').on(t.folderId),
    index('bookmarks_deleted_at_idx').on(t.deletedAt),
  ],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
```

- [ ] **Step 3: Write `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
```

- [ ] **Step 4: Generate the migration**

```bash
pnpm drizzle-kit generate
```
Expected: creates `src/db/migrations/0000_<name>.sql` and `src/db/migrations/meta/`.

- [ ] **Step 5: Write a test asserting the generated SQL contains every required index**

```ts
// src/db/__tests__/schema.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'src/db/migrations');
const sql = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n');

describe('generated migrations', () => {
  it('creates every table', () => {
    for (const table of ['folders', 'bookmarks', 'import_batches', 'settings']) {
      expect(sql).toContain(`CREATE TABLE \`${table}\``);
    }
  });

  it('creates all five required indexes', () => {
    for (const idx of [
      'bookmarks_url_hash_idx',
      'bookmarks_site_idx',
      'bookmarks_folder_id_idx',
      'bookmarks_deleted_at_idx',
      'folders_parent_id_idx',
    ]) {
      expect(sql).toContain(idx);
    }
  });
});
```

- [ ] **Step 6: Run the test**

Run: `pnpm vitest run src/db/__tests__/schema.test.ts`
Expected: PASS, 2 tests. If an index is missing, fix `schema.ts`, delete
`src/db/migrations/`, and regenerate.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add drizzle schema with required indexes and initial migration"
```

---

### Task 6: SQLocal client, Tx abstraction, migration runner, and boot guard

**Files:**
- Create: `src/db/client.ts`, `src/db/migrate.ts`, `src/db/testDb.ts`
- Create: `src/app/BootGuard.tsx`
- Test: `src/db/__tests__/migrate.test.ts`

**Interfaces:**
- Consumes: `schema` (Task 5)
- Produces:
  ```ts
  // client.ts
  type Tx = { exec(sql: string, params: unknown[]): Promise<void> };
  type Db = SqliteRemoteDatabase<typeof schema>;
  const sqlocal: SQLocalDrizzle;
  const db: Db;
  function transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
  function checkEnvironment(): { ok: true } | { ok: false; reason: string; fix: string };

  // migrate.ts
  function runMigrations(tx: Tx, applied: Set<string>): Promise<string[]>;  // returns ids applied
  function loadMigrations(): { id: string; sql: string }[];

  // testDb.ts  (test-only)
  function createTestDb(): { db: BetterSQLite3Database<typeof schema>; tx: Tx; close(): void };
  ```

- [ ] **Step 1: Write `src/db/client.ts`**

```ts
import { SQLocalDrizzle } from 'sqlocal/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

/**
 * Narrow write seam. SQLocal's TransactionHandle is NOT a Drizzle database —
 * it exposes only query/sql/batch — so statements are built with Drizzle for
 * type safety and executed here as raw SQL. This interface is also what lets
 * repositories be tested against better-sqlite3 in Node.
 */
export type Tx = { exec(sql: string, params: unknown[]): Promise<void> };

export type Db = SqliteRemoteDatabase<typeof schema>;

export const sqlocal = new SQLocalDrizzle({
  databasePath: 'bookmarks.sqlite3',
  verbose: false,
});

export const db: Db = drizzle(sqlocal.driver, sqlocal.batchDriver, { schema });

export function transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
  return sqlocal.transaction(async (handle) => {
    const tx: Tx = {
      exec: async (sql, params) => {
        await handle.sql(sql, ...params);
      },
    };
    return fn(tx);
  });
}

/**
 * SQLocal needs a Worker, OPFS, and cross-origin isolation. Without isolation
 * the browser blocks OPFS and every write is silently discarded, so this must
 * fail loudly at boot rather than let the app appear to work.
 */
export function checkEnvironment():
  | { ok: true }
  | { ok: false; reason: string; fix: string } {
  if (typeof Worker === 'undefined') {
    return {
      ok: false,
      reason: 'This browser does not support Web Workers.',
      fix: 'Use a current version of Chrome, Edge, Firefox, Brave, or Safari.',
    };
  }
  if (!navigator.storage?.getDirectory) {
    return {
      ok: false,
      reason: 'This browser does not support the Origin Private File System.',
      fix: 'Use Chrome/Edge 108+, Firefox 111+, or Safari 17+.',
    };
  }
  if (!crossOriginIsolated) {
    return {
      ok: false,
      reason: 'This page is not cross-origin isolated, so the browser blocks database storage.',
      fix: 'Serve the app with the headers "Cross-Origin-Opener-Policy: same-origin" and "Cross-Origin-Embedder-Policy: credentialless".',
    };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Write `src/db/migrate.ts`**

```ts
import type { Tx } from './client';

// Vite inlines every migration as a raw string at build time, so migrations
// ship with the bundle and need no network access.
const FILES = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const BOOKKEEPING_SQL = `CREATE TABLE IF NOT EXISTS migrations (
  id text PRIMARY KEY,
  hash text NOT NULL,
  applied_at integer NOT NULL
)`;

/** Cheap, stable, non-cryptographic hash — enough to detect an edited migration. */
export function hashSql(sql: string): string {
  let h = 2166136261;
  for (let i = 0; i < sql.length; i++) {
    h ^= sql.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function loadMigrations(): { id: string; sql: string }[] {
  return Object.entries(FILES)
    .map(([path, sql]) => ({ id: path.split('/').pop() ?? path, sql }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Splits a drizzle-kit file on its statement-breakpoint markers. */
export function splitStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Applies every unapplied migration in filename order. `applied` maps id -> hash
 * for already-applied migrations; a hash mismatch is a hard error, never a
 * silent skip.
 */
export async function runMigrations(
  tx: Tx,
  applied: Map<string, string>,
): Promise<string[]> {
  await tx.exec(BOOKKEEPING_SQL, []);
  const ran: string[] = [];

  for (const { id, sql } of loadMigrations()) {
    const hash = hashSql(sql);
    const previous = applied.get(id);

    if (previous !== undefined) {
      if (previous !== hash) {
        throw new Error(
          `Migration ${id} was modified after it was applied (expected hash ${previous}, got ${hash}). ` +
            `Migrations are immutable once applied — add a new migration instead.`,
        );
      }
      continue;
    }

    for (const statement of splitStatements(sql)) {
      await tx.exec(statement, []);
    }
    await tx.exec(
      'INSERT INTO migrations (id, hash, applied_at) VALUES (?, ?, ?)',
      [id, hash, Math.floor(Date.now() / 1000)],
    );
    ran.push(id);
  }

  return ran;
}
```

- [ ] **Step 3: Write `src/db/testDb.ts` — the Node-side seam**

```ts
// Test-only. OPFS does not exist in Node, so repository tests run the same
// schema and the same migration SQL against better-sqlite3.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import type { Tx } from './client';

export function createTestDb(): {
  db: BetterSQLite3Database<typeof schema>;
  tx: Tx;
  close: () => void;
} {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  const tx: Tx = {
    exec: async (sql, params) => {
      sqlite.prepare(sql).run(...(params as never[]));
    },
  };
  return { db, tx, close: () => sqlite.close() };
}
```

- [ ] **Step 4: Write the failing migration test**

```ts
// src/db/__tests__/migrate.test.ts
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '@/db/testDb';
import { hashSql, loadMigrations, runMigrations, splitStatements } from '@/db/migrate';

describe('runMigrations', () => {
  it('applies every migration on a fresh database', async () => {
    const { tx, close } = createTestDb();
    const ran = await runMigrations(tx, new Map());
    expect(ran.length).toBeGreaterThan(0);
    close();
  });

  it('is idempotent — a second run applies nothing', async () => {
    const { db, tx, close } = createTestDb();
    await runMigrations(tx, new Map());

    const rows = db.all<{ id: string; hash: string }>(sql`SELECT id, hash FROM migrations`);
    const applied = new Map(rows.map((r) => [r.id, r.hash]));

    expect(await runMigrations(tx, applied)).toEqual([]);
    close();
  });

  it('creates the bookmarks table with a working url_hash index', async () => {
    const { db, tx, close } = createTestDb();
    await runMigrations(tx, new Map());
    const idx = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='index' AND name='bookmarks_url_hash_idx'`,
    );
    expect(idx).toHaveLength(1);
    close();
  });

  it('refuses to run when an applied migration was edited', async () => {
    const { tx, close } = createTestDb();
    const first = loadMigrations()[0];
    expect(first).toBeDefined();
    const stale = new Map([[first!.id, 'deadbeef']]);
    await expect(runMigrations(tx, stale)).rejects.toThrow(/modified after it was applied/);
    close();
  });
});

describe('splitStatements', () => {
  it('splits on drizzle statement breakpoints and drops empties', () => {
    expect(splitStatements('A;\n--> statement-breakpoint\nB;\n')).toEqual(['A;', 'B;']);
  });
});

describe('hashSql', () => {
  it('is stable and input-sensitive', () => {
    expect(hashSql('abc')).toBe(hashSql('abc'));
    expect(hashSql('abc')).not.toBe(hashSql('abd'));
  });
});
```

- [ ] **Step 5: Run test to verify it fails, then passes**

Run: `pnpm vitest run src/db/__tests__/migrate.test.ts`
Expected first: FAIL — modules unresolved. After Steps 1–3 exist: PASS, 6 tests.

Note: `import.meta.glob` is a Vite feature. Vitest supports it natively because it uses
Vite's transform pipeline, so no mock is required.

- [ ] **Step 6: Write `src/app/BootGuard.tsx`**

```tsx
import type { ReactNode } from 'react';
import { checkEnvironment } from '@/db/client';

export function BootGuard({ children }: { children: ReactNode }) {
  const result = checkEnvironment();
  if (result.ok) return <>{children}</>;

  return (
    <div className="flex h-dvh items-center justify-center bg-bg p-8 text-text">
      <div className="max-w-lg rounded-[6px] border border-line bg-surface p-8">
        <h1 className="font-display text-2xl">This browser can't run the app</h1>
        <p className="mt-4 text-text">{result.reason}</p>
        <p className="mt-3 text-sm text-muted">{result.fix}</p>
        <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
          Your bookmarks are stored locally in this browser. Rather than risk
          silently discarding them, the app stops here.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify a real OPFS round-trip in a real browser**

This is the one thing Node tests cannot cover. Wrap `<App/>` in `<BootGuard>`, then add a
temporary boot call in `main.tsx`:

```ts
import { db, transaction } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { sql } from 'drizzle-orm';

const rows = await db.all<{ id: string; hash: string }>(
  sql`SELECT id, hash FROM migrations`,
).catch(() => []);
await transaction((tx) => runMigrations(tx, new Map(rows.map((r) => [r.id, r.hash]))));
console.log('migrations ok', await db.all(sql`SELECT name FROM sqlite_master WHERE type='table'`));
```

Run `pnpm dev`. Expected: the console lists `folders`, `bookmarks`, `import_batches`,
`settings`, `migrations`. **Hard-refresh and confirm no migration re-runs** — that proves
OPFS actually persisted. Then remove the temporary logging.

**If `crossOriginIsolated` is false**, BootGuard renders instead. Fix `vite.config.ts`
before continuing; nothing downstream works without this.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add sqlocal client, transaction seam, migration runner, and boot guard"
```

---

### Task 7: System folder seeding and the settings repository

**Files:**
- Create: `src/db/seed.ts`, `src/db/repo/settings.ts`, `src/db/boot.ts`
- Test: `src/db/__tests__/seed.test.ts`, `src/db/repo/__tests__/settings.test.ts`

**Interfaces:**
- Consumes: `Db`, `Tx` (Task 6), `schema` (Task 5)
- Produces:
  ```ts
  // seed.ts
  const SYSTEM_FOLDERS: readonly { systemKey: SystemKey; name: string; sortOrder: number }[];
  function seedSystemFolders(db: Db, tx: Tx): Promise<void>;   // idempotent
  function getSystemFolderId(db: Db, key: SystemKey): Promise<string>;

  // repo/settings.ts
  function getSetting<T>(db: Db, key: string, fallback: T): Promise<T>;
  function setSetting(db: Db, tx: Tx, key: string, value: unknown): Promise<void>;

  // boot.ts
  function bootDatabase(
    db: Db,
    transaction: <R>(fn: (tx: Tx) => Promise<R>) => Promise<R>,
  ): Promise<void>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/db/__tests__/seed.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/db/testDb';
import { runMigrations } from '@/db/migrate';
import { getSystemFolderId, seedSystemFolders, SYSTEM_FOLDERS } from '@/db/seed';
import { folders } from '@/db/schema';
import type { Tx } from '@/db/client';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

let db: BetterSQLite3Database<typeof schema>;
let tx: Tx;
let close: () => void;

beforeEach(async () => {
  ({ db, tx, close } = createTestDb());
  await runMigrations(tx, new Map());
});

describe('seedSystemFolders', () => {
  it('creates exactly the three system folders', async () => {
    await seedSystemFolders(db, tx);
    const rows = await db.select().from(folders);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.isSystem)).toBe(true);
    expect(rows.map((r) => r.systemKey).sort()).toEqual(['pinned', 'trash', 'unsorted']);
    close();
  });

  it('is idempotent across repeated boots', async () => {
    await seedSystemFolders(db, tx);
    await seedSystemFolders(db, tx);
    await seedSystemFolders(db, tx);
    expect(await db.select().from(folders)).toHaveLength(3);
    close();
  });

  it('preserves the original id so bookmarks keep their folder across boots', async () => {
    await seedSystemFolders(db, tx);
    const first = await getSystemFolderId(db, 'unsorted');
    await seedSystemFolders(db, tx);
    expect(await getSystemFolderId(db, 'unsorted')).toBe(first);
    close();
  });

  it('defines all three keys in SYSTEM_FOLDERS', () => {
    expect(SYSTEM_FOLDERS.map((f) => f.systemKey)).toEqual(['unsorted', 'pinned', 'trash']);
    close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/db/__tests__/seed.test.ts`
Expected: FAIL — cannot resolve `@/db/seed`.

- [ ] **Step 3: Write `src/db/seed.ts`**

```ts
import { eq } from 'drizzle-orm';
import type { Db, Tx } from './client';
import { folders, type SystemKey } from './schema';

export const SYSTEM_FOLDERS: readonly {
  systemKey: SystemKey;
  name: string;
  sortOrder: number;
}[] = [
  { systemKey: 'unsorted', name: 'Unsorted', sortOrder: 0 },
  { systemKey: 'pinned', name: 'Pinned', sortOrder: 1 },
  { systemKey: 'trash', name: 'Trash', sortOrder: 2 },
];

/**
 * Idempotent: matches on systemKey, so an existing folder keeps its id and the
 * bookmarks pointing at it. Safe to call on every boot.
 */
export async function seedSystemFolders(db: Db, tx: Tx): Promise<void> {
  const existing = await db
    .select({ systemKey: folders.systemKey })
    .from(folders)
    .where(eq(folders.isSystem, true));
  const present = new Set(existing.map((r) => r.systemKey));
  const now = Math.floor(Date.now() / 1000);

  for (const folder of SYSTEM_FOLDERS) {
    if (present.has(folder.systemKey)) continue;
    const built = db
      .insert(folders)
      .values({
        id: crypto.randomUUID(),
        parentId: null,
        name: folder.name,
        sortOrder: folder.sortOrder,
        isSystem: true,
        systemKey: folder.systemKey,
        createdAt: now,
        updatedAt: now,
      })
      .toSQL();
    await tx.exec(built.sql, built.params);
  }
}

export async function getSystemFolderId(db: Db, key: SystemKey): Promise<string> {
  const [row] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.systemKey, key))
    .limit(1);
  if (!row) throw new Error(`System folder "${key}" is missing — seeding did not run.`);
  return row.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/db/__tests__/seed.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the settings repository test**

```ts
// src/db/repo/__tests__/settings.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/db/testDb';
import { runMigrations } from '@/db/migrate';
import { getSetting, setSetting } from '@/db/repo/settings';
import type { Tx } from '@/db/client';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

let db: BetterSQLite3Database<typeof schema>;
let tx: Tx;
let close: () => void;

beforeEach(async () => {
  ({ db, tx, close } = createTestDb());
  await runMigrations(tx, new Map());
});

describe('settings repository', () => {
  it('returns the fallback for a missing key', async () => {
    expect(await getSetting(db, 'nope', 42)).toBe(42);
    close();
  });

  it('round-trips structured values', async () => {
    await setSetting(db, tx, 'panes', { sidebar: 260, detail: 340 });
    expect(await getSetting(db, 'panes', null)).toEqual({ sidebar: 260, detail: 340 });
    close();
  });

  it('overwrites an existing key rather than duplicating it', async () => {
    await setSetting(db, tx, 'k', 'a');
    await setSetting(db, tx, 'k', 'b');
    expect(await getSetting(db, 'k', '')).toBe('b');
    close();
  });

  it('returns the fallback when a stored value is corrupt', async () => {
    await tx.exec("INSERT INTO settings (key, value) VALUES ('bad', '{oops')", []);
    expect(await getSetting(db, 'bad', 'safe')).toBe('safe');
    close();
  });
});
```

- [ ] **Step 6: Write `src/db/repo/settings.ts`**

```ts
import { eq } from 'drizzle-orm';
import type { Db, Tx } from '../client';
import { settings } from '../schema';

/** Values are JSON. A corrupt value yields the fallback rather than throwing. */
export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(
  db: Db,
  tx: Tx,
  key: string,
  value: unknown,
): Promise<void> {
  const built = db
    .insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
    .toSQL();
  await tx.exec(built.sql, built.params);
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm vitest run src/db/repo/__tests__/settings.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Write `src/db/boot.ts` and wire it into `main.tsx`**

```ts
import { sql } from 'drizzle-orm';
import type { Db, Tx } from './client';
import { runMigrations } from './migrate';
import { seedSystemFolders } from './seed';

export async function bootDatabase(
  db: Db,
  transaction: <R>(fn: (tx: Tx) => Promise<R>) => Promise<R>,
): Promise<void> {
  // The bookkeeping table may not exist on the very first boot.
  const applied = await db
    .all<{ id: string; hash: string }>(sql`SELECT id, hash FROM migrations`)
    .catch(() => [] as { id: string; hash: string }[]);

  await transaction((tx) => runMigrations(tx, new Map(applied.map((r) => [r.id, r.hash]))));
  await transaction((tx) => seedSystemFolders(db, tx));
}
```

Call `bootDatabase(db, transaction)` once inside `BootGuard` before rendering the app,
showing a skeleton while it resolves.

- [ ] **Step 9: Verify in the browser and commit**

Run `pnpm dev`, hard-refresh twice. Expected: the app renders, and the `folders` table
holds exactly three rows both times.

```bash
git add -A
git commit -m "feat: seed system folders idempotently and add settings repository"
```

---

### Task 8: Folder and bookmark repositories

**Files:**
- Create: `src/db/repo/folders.ts`, `src/db/repo/bookmarks.ts`, `src/db/repo/importBatches.ts`
- Test: `src/db/repo/__tests__/folders.test.ts`, `src/db/repo/__tests__/bookmarks.test.ts`
- Create: `src/db/repo/__tests__/helpers.ts`

**Interfaces:**
- Consumes: `Db`, `Tx`, `seedSystemFolders`, `getSystemFolderId`
- Produces:
  ```ts
  // repo/folders.ts
  type FolderNode = Folder & { children: FolderNode[]; depth: number };
  function listFolders(db: Db): Promise<Folder[]>;
  function buildTree(rows: Folder[]): FolderNode[];          // PURE
  function folderPath(rows: Folder[], id: string): string[];  // PURE, root-first names
  function isDescendant(rows: Folder[], candidate: string, ancestor: string): boolean; // PURE
  function createFolder(db: Db, tx: Tx, input: { name: string; parentId: string | null }): Promise<string>;
  function renameFolder(db: Db, tx: Tx, id: string, name: string): Promise<void>;

  // repo/bookmarks.ts
  type BookmarkFilter = {
    folderId?: string | null; site?: string; tag?: string;
    sourceBrowser?: SourceBrowser; importBatchId?: string;
    untagged?: boolean; neverOpened?: boolean; addedBefore?: number;
    includeDeleted?: boolean;
  };
  function listBookmarks(db: Db, filter: BookmarkFilter, sort: { key: SortKey; dir: SortDir }): Promise<Bookmark[]>;
  function insertBookmarks(db: Db, tx: Tx, rows: NewBookmark[]): Promise<void>;  // chunks of 500
  function countsByFolder(db: Db): Promise<Map<string, number>>;
  function rollupCounts(tree: FolderNode[], direct: Map<string, number>): Map<string, number>; // PURE
  function findByHashes(db: Db, hashes: string[]): Promise<Set<string>>;
  function recordOpen(db: Db, tx: Tx, id: string): Promise<void>;
  ```

- [ ] **Step 1: Write the shared test helper**

```ts
// src/db/repo/__tests__/helpers.ts
import { createTestDb } from '@/db/testDb';
import { runMigrations } from '@/db/migrate';
import { seedSystemFolders } from '@/db/seed';
import type { Tx } from '@/db/client';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { normalizeUrl, siteOf, urlHash } from '@/lib/url';

export async function freshDb(): Promise<{
  db: BetterSQLite3Database<typeof schema>;
  tx: Tx;
  close: () => void;
}> {
  const handle = createTestDb();
  await runMigrations(handle.tx, new Map());
  await seedSystemFolders(handle.db, handle.tx);
  return handle;
}

/** Builds a bookmark row with the derived columns computed the same way import does. */
export async function makeBookmark(
  url: string,
  overrides: Partial<schema.NewBookmark> = {},
): Promise<schema.NewBookmark> {
  const normalized = normalizeUrl(url);
  const now = Math.floor(Date.now() / 1000);
  return {
    id: crypto.randomUUID(),
    folderId: null,
    url,
    normalizedUrl: normalized,
    urlHash: await urlHash(normalized),
    site: siteOf(url),
    title: url,
    tags: '[]',
    isPinned: false,
    addedAt: now,
    openCount: 0,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing folder test**

```ts
// src/db/repo/__tests__/folders.test.ts
import { describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import {
  buildTree, createFolder, folderPath, isDescendant, listFolders,
} from '@/db/repo/folders';
import type { Folder } from '@/db/schema';

function row(id: string, parentId: string | null, name: string): Folder {
  return {
    id, parentId, name, icon: null, color: null, sortOrder: 0,
    isSystem: false, systemKey: null, createdAt: 0, updatedAt: 0,
  };
}

describe('buildTree', () => {
  it('nests children under parents and records depth', () => {
    const tree = buildTree([row('a', null, 'A'), row('b', 'a', 'B'), row('c', 'b', 'C')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.depth).toBe(0);
    expect(tree[0]!.children[0]!.name).toBe('B');
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
  });

  it('treats a row with a missing parent as a root rather than dropping it', () => {
    const tree = buildTree([row('orphan', 'gone', 'Orphan')]);
    expect(tree.map((n) => n.id)).toEqual(['orphan']);
  });

  it('sorts siblings by sortOrder then name', () => {
    const rows = [row('a', null, 'Zebra'), row('b', null, 'Apple')];
    expect(buildTree(rows).map((n) => n.name)).toEqual(['Apple', 'Zebra']);
  });
});

describe('folderPath', () => {
  it('returns root-first names', () => {
    const rows = [row('a', null, 'A'), row('b', 'a', 'B'), row('c', 'b', 'C')];
    expect(folderPath(rows, 'c')).toEqual(['A', 'B', 'C']);
  });

  it('returns an empty path for an unknown id', () => {
    expect(folderPath([], 'nope')).toEqual([]);
  });
});

describe('isDescendant', () => {
  const rows = [row('a', null, 'A'), row('b', 'a', 'B'), row('c', 'b', 'C')];

  it('detects nested descendants', () => {
    expect(isDescendant(rows, 'c', 'a')).toBe(true);
    expect(isDescendant(rows, 'a', 'c')).toBe(false);
  });

  it('treats a folder as its own descendant so it cannot be dropped into itself', () => {
    expect(isDescendant(rows, 'a', 'a')).toBe(true);
  });

  it('terminates on a cycle instead of hanging', () => {
    const cyclic = [row('x', 'y', 'X'), row('y', 'x', 'Y')];
    expect(isDescendant(cyclic, 'x', 'z')).toBe(false);
  });
});

describe('createFolder', () => {
  it('persists a folder and reads it back in the tree', async () => {
    const { db, tx, close } = await freshDb();
    const id = await createFolder(db, tx, { name: 'Dev', parentId: null });
    const child = await createFolder(db, tx, { name: 'Tools', parentId: id });

    const rows = await listFolders(db);
    expect(folderPath(rows, child)).toEqual(['Dev', 'Tools']);
    close();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/db/repo/__tests__/folders.test.ts`
Expected: FAIL — cannot resolve `@/db/repo/folders`.

- [ ] **Step 4: Write `src/db/repo/folders.ts`**

```ts
import { asc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../client';
import { folders, type Folder } from '../schema';

export type FolderNode = Folder & { children: FolderNode[]; depth: number };

export function listFolders(db: Db): Promise<Folder[]> {
  return db.select().from(folders).orderBy(asc(folders.sortOrder), asc(folders.name));
}

/**
 * PURE. O(n). A row whose parent is missing becomes a root rather than
 * disappearing — losing bookmarks to a dangling parentId would be worse than
 * showing the folder in the wrong place.
 */
export function buildTree(rows: Folder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [], depth: 0 });

  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortSiblings = (list: FolderNode[], depth: number) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const node of list) {
      node.depth = depth;
      sortSiblings(node.children, depth + 1);
    }
  };
  sortSiblings(roots, 0);
  return roots;
}

/** PURE. Root-first folder names. Cycle-safe. */
export function folderPath(rows: Folder[], id: string): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/**
 * PURE. True when `candidate` is `ancestor` or sits beneath it. Used to block
 * dropping a folder into its own subtree. Cycle-safe.
 */
export function isDescendant(rows: Folder[], candidate: string, ancestor: string): boolean {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  let current: string | null | undefined = candidate;
  while (current && !seen.has(current)) {
    if (current === ancestor) return true;
    seen.add(current);
    current = byId.get(current)?.parentId;
  }
  return false;
}

export async function createFolder(
  db: Db,
  tx: Tx,
  input: { name: string; parentId: string | null; icon?: string; color?: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const built = db
    .insert(folders)
    .values({
      id,
      parentId: input.parentId,
      name: input.name,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder: 0,
      isSystem: false,
      systemKey: null,
      createdAt: now,
      updatedAt: now,
    })
    .toSQL();
  await tx.exec(built.sql, built.params);
  return id;
}

export async function renameFolder(db: Db, tx: Tx, id: string, name: string): Promise<void> {
  const built = db
    .update(folders)
    .set({ name, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(folders.id, id))
    .toSQL();
  await tx.exec(built.sql, built.params);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/db/repo/__tests__/folders.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Write the failing bookmark test**

```ts
// src/db/repo/__tests__/bookmarks.test.ts
import { describe, expect, it } from 'vitest';
import { freshDb, makeBookmark } from './helpers';
import { buildTree } from '@/db/repo/folders';
import {
  countsByFolder, findByHashes, insertBookmarks, listBookmarks, recordOpen, rollupCounts,
} from '@/db/repo/bookmarks';
import { getSystemFolderId } from '@/db/seed';
import type { Folder } from '@/db/schema';

describe('insertBookmarks', () => {
  it('inserts and reads back', async () => {
    const { db, tx, close } = await freshDb();
    await insertBookmarks(db, tx, [
      await makeBookmark('https://react.dev'),
      await makeBookmark('https://vite.dev'),
    ]);
    expect(await listBookmarks(db, {}, { key: 'title', dir: 'asc' })).toHaveLength(2);
    close();
  });

  it('handles more than one chunk without dropping rows', async () => {
    const { db, tx, close } = await freshDb();
    const rows = await Promise.all(
      Array.from({ length: 1201 }, (_, i) => makeBookmark(`https://example.com/${i}`)),
    );
    await insertBookmarks(db, tx, rows);
    expect(await listBookmarks(db, {}, { key: 'title', dir: 'asc' })).toHaveLength(1201);
    close();
  });

  it('accepts an empty array without emitting SQL', async () => {
    const { db, tx, close } = await freshDb();
    await expect(insertBookmarks(db, tx, [])).resolves.toBeUndefined();
    close();
  });
});

describe('listBookmarks filters', () => {
  it('hides soft-deleted rows unless asked', async () => {
    const { db, tx, close } = await freshDb();
    await insertBookmarks(db, tx, [
      await makeBookmark('https://a.com'),
      await makeBookmark('https://b.com', { deletedAt: 100 }),
    ]);
    expect(await listBookmarks(db, {}, { key: 'title', dir: 'asc' })).toHaveLength(1);
    expect(
      await listBookmarks(db, { includeDeleted: true }, { key: 'title', dir: 'asc' }),
    ).toHaveLength(2);
    close();
  });

  it('filters by site, untagged, and never-opened', async () => {
    const { db, tx, close } = await freshDb();
    await insertBookmarks(db, tx, [
      await makeBookmark('https://w3schools.com/html/default.asp', { tags: '["html"]' }),
      await makeBookmark('https://w3schools.com/js/default.asp', { openCount: 3 }),
      await makeBookmark('https://react.dev'),
    ]);

    expect(
      await listBookmarks(db, { site: 'w3schools.com' }, { key: 'title', dir: 'asc' }),
    ).toHaveLength(2);
    expect(await listBookmarks(db, { untagged: true }, { key: 'title', dir: 'asc' }))
      .toHaveLength(2);
    expect(await listBookmarks(db, { neverOpened: true }, { key: 'title', dir: 'asc' }))
      .toHaveLength(2);
    close();
  });

  it('sorts ascending and descending', async () => {
    const { db, tx, close } = await freshDb();
    await insertBookmarks(db, tx, [
      await makeBookmark('https://a.com', { title: 'Beta' }),
      await makeBookmark('https://b.com', { title: 'Alpha' }),
    ]);
    const asc = await listBookmarks(db, {}, { key: 'title', dir: 'asc' });
    expect(asc.map((b) => b.title)).toEqual(['Alpha', 'Beta']);
    const desc = await listBookmarks(db, {}, { key: 'title', dir: 'desc' });
    expect(desc.map((b) => b.title)).toEqual(['Beta', 'Alpha']);
    close();
  });
});

describe('findByHashes', () => {
  it('returns only the hashes already present', async () => {
    const { db, tx, close } = await freshDb();
    const existing = await makeBookmark('https://react.dev');
    await insertBookmarks(db, tx, [existing]);
    const found = await findByHashes(db, [existing.urlHash, 'absent-hash']);
    expect(found.has(existing.urlHash)).toBe(true);
    expect(found.has('absent-hash')).toBe(false);
    close();
  });

  it('chunks large hash lists past the SQLite variable limit', async () => {
    const { db, tx, close } = await freshDb();
    const rows = await Promise.all(
      Array.from({ length: 2000 }, (_, i) => makeBookmark(`https://example.com/${i}`)),
    );
    await insertBookmarks(db, tx, rows);
    const found = await findByHashes(db, rows.map((r) => r.urlHash));
    expect(found.size).toBe(2000);
    close();
  });
});

describe('counts', () => {
  it('counts per folder and rolls up through the tree', async () => {
    const { db, tx, close } = await freshDb();
    const unsorted = await getSystemFolderId(db, 'unsorted');
    await insertBookmarks(db, tx, [
      await makeBookmark('https://a.com', { folderId: unsorted }),
      await makeBookmark('https://b.com', { folderId: unsorted }),
    ]);

    const direct = await countsByFolder(db);
    expect(direct.get(unsorted)).toBe(2);

    const rows: Folder[] = await db.select().from((await import('@/db/schema')).folders);
    const rolled = rollupCounts(buildTree(rows), direct);
    expect(rolled.get(unsorted)).toBe(2);
    close();
  });

  it('rollupCounts sums descendants into ancestors', () => {
    const tree = buildTree([
      { id: 'a', parentId: null, name: 'A', icon: null, color: null, sortOrder: 0, isSystem: false, systemKey: null, createdAt: 0, updatedAt: 0 },
      { id: 'b', parentId: 'a', name: 'B', icon: null, color: null, sortOrder: 0, isSystem: false, systemKey: null, createdAt: 0, updatedAt: 0 },
    ]);
    const rolled = rollupCounts(tree, new Map([['a', 1], ['b', 4]]));
    expect(rolled.get('a')).toBe(5);
    expect(rolled.get('b')).toBe(4);
  });
});

describe('recordOpen', () => {
  it('increments openCount and sets lastOpenedAt', async () => {
    const { db, tx, close } = await freshDb();
    const row = await makeBookmark('https://react.dev');
    await insertBookmarks(db, tx, [row]);
    await recordOpen(db, tx, row.id!);

    const [after] = await listBookmarks(db, {}, { key: 'title', dir: 'asc' });
    expect(after!.openCount).toBe(1);
    expect(after!.lastOpenedAt).toBeGreaterThan(0);
    close();
  });
});
```

- [ ] **Step 7: Write `src/db/repo/bookmarks.ts`**

```ts
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Db, Tx } from '../client';
import { bookmarks, type Bookmark, type NewBookmark, type SourceBrowser } from '../schema';
import type { FolderNode } from './folders';
// Sort types live in lib/, not the UI store — the data layer must not depend
// on UI state.
import type { SortDir, SortKey } from '@/lib/sort';

/** SQLite's default variable limit is 999; stay well under it. */
const CHUNK = 500;

export type BookmarkFilter = {
  folderId?: string | null;
  site?: string;
  tag?: string;
  sourceBrowser?: SourceBrowser;
  importBatchId?: string;
  untagged?: boolean;
  neverOpened?: boolean;
  addedBefore?: number;
  includeDeleted?: boolean;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function insertBookmarks(db: Db, tx: Tx, rows: NewBookmark[]): Promise<void> {
  for (const batch of chunk(rows, CHUNK)) {
    if (batch.length === 0) continue;
    const built = db.insert(bookmarks).values(batch).toSQL();
    await tx.exec(built.sql, built.params);
  }
}

function buildWhere(filter: BookmarkFilter): SQL | undefined {
  const clauses: SQL[] = [];
  if (!filter.includeDeleted) clauses.push(isNull(bookmarks.deletedAt));
  if (filter.folderId !== undefined) {
    clauses.push(
      filter.folderId === null
        ? isNull(bookmarks.folderId)
        : eq(bookmarks.folderId, filter.folderId),
    );
  }
  if (filter.site) clauses.push(eq(bookmarks.site, filter.site));
  if (filter.sourceBrowser) clauses.push(eq(bookmarks.sourceBrowser, filter.sourceBrowser));
  if (filter.importBatchId) clauses.push(eq(bookmarks.importBatchId, filter.importBatchId));
  if (filter.untagged) clauses.push(eq(bookmarks.tags, '[]'));
  if (filter.neverOpened) clauses.push(eq(bookmarks.openCount, 0));
  if (filter.addedBefore !== undefined) clauses.push(lt(bookmarks.addedAt, filter.addedBefore));
  // Tags are a JSON array in a text column; a LIKE on the quoted value is exact
  // enough because tag strings are stored JSON-escaped.
  if (filter.tag) clauses.push(sql`${bookmarks.tags} LIKE ${`%"${filter.tag}"%`}`);
  return clauses.length ? and(...clauses) : undefined;
}

const SORT_COLUMNS = {
  title: bookmarks.title,
  addedAt: bookmarks.addedAt,
  lastOpenedAt: bookmarks.lastOpenedAt,
  openCount: bookmarks.openCount,
  site: bookmarks.site,
  manual: bookmarks.sortOrder,
} as const;

export function listBookmarks(
  db: Db,
  filter: BookmarkFilter,
  sort: { key: SortKey; dir: SortDir },
): Promise<Bookmark[]> {
  const column = SORT_COLUMNS[sort.key];
  return db
    .select()
    .from(bookmarks)
    .where(buildWhere(filter))
    .orderBy(sort.dir === 'asc' ? asc(column) : desc(column));
}

/** Returns the subset of `hashes` already present. Chunked past the variable limit. */
export async function findByHashes(db: Db, hashes: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of chunk(hashes, CHUNK)) {
    if (batch.length === 0) continue;
    const rows = await db
      .select({ urlHash: bookmarks.urlHash })
      .from(bookmarks)
      .where(inArray(bookmarks.urlHash, batch));
    for (const row of rows) found.add(row.urlHash);
  }
  return found;
}

export async function countsByFolder(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({ folderId: bookmarks.folderId, count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(and(isNull(bookmarks.deletedAt), isNotNull(bookmarks.folderId)))
    .groupBy(bookmarks.folderId);
  return new Map(rows.filter((r) => r.folderId).map((r) => [r.folderId!, r.count]));
}

/** PURE. Adds each subtree's totals into its ancestors. O(n). */
export function rollupCounts(
  tree: FolderNode[],
  direct: Map<string, number>,
): Map<string, number> {
  const rolled = new Map<string, number>();
  const visit = (node: FolderNode): number => {
    let total = direct.get(node.id) ?? 0;
    for (const child of node.children) total += visit(child);
    rolled.set(node.id, total);
    return total;
  };
  for (const node of tree) visit(node);
  return rolled;
}

export async function recordOpen(db: Db, tx: Tx, id: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const built = db
    .update(bookmarks)
    .set({ openCount: sql`${bookmarks.openCount} + 1`, lastOpenedAt: now, updatedAt: now })
    .where(eq(bookmarks.id, id))
    .toSQL();
  await tx.exec(built.sql, built.params);
}
```

Note: `gt` is imported but unused if no filter needs it — remove unused imports to satisfy
`noUnusedLocals`.

- [ ] **Step 8: Write `src/db/repo/importBatches.ts`**

```ts
import { desc } from 'drizzle-orm';
import type { Db, Tx } from '../client';
import { importBatches, type ImportBatch, type NewImportBatch } from '../schema';

export async function recordImportBatch(
  db: Db,
  tx: Tx,
  batch: NewImportBatch,
): Promise<void> {
  const built = db.insert(importBatches).values(batch).toSQL();
  await tx.exec(built.sql, built.params);
}

export function listImportBatches(db: Db): Promise<ImportBatch[]> {
  return db.select().from(importBatches).orderBy(desc(importBatches.importedAt));
}
```

- [ ] **Step 9: Run the full suite**

Run: `pnpm test`
Expected: all tests pass, including 11 bookmark tests.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add folder, bookmark, and import batch repositories"
```

---

## Phase 3 — Import

### Task 9: Browser detection and export instructions

**Files:**
- Create: `src/features/import/browserDetect.ts`, `src/features/import/ExportInstructions.tsx`
- Test: `src/features/import/__tests__/browserDetect.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  type BrowserId = 'chrome'|'firefox'|'brave'|'edge'|'safari'|'arc'|'opera'|'unknown';
  type DetectSignals = {
    userAgent: string;
    brands?: { brand: string; version: string }[];
    isBrave?: boolean;
  };
  function detectBrowser(signals: DetectSignals): BrowserId;         // PURE
  function readSignals(): Promise<DetectSignals>;                    // browser-only
  const EXPORT_STEPS: Record<BrowserId, { label: string; internalUrl?: string; steps: string[] }>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/features/import/__tests__/browserDetect.test.ts
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
    for (const id of ['chrome', 'firefox', 'brave', 'edge', 'safari', 'arc', 'opera', 'unknown'] as const) {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/import/__tests__/browserDetect.test.ts`
Expected: FAIL — cannot resolve `@/features/import/browserDetect`.

- [ ] **Step 3: Write `src/features/import/browserDetect.ts`**

```ts
export type BrowserId =
  | 'chrome' | 'firefox' | 'brave' | 'edge' | 'safari' | 'arc' | 'opera' | 'unknown';

export type DetectSignals = {
  userAgent: string;
  brands?: { brand: string; version: string }[];
  isBrave?: boolean;
};

/**
 * PURE so it can be tested without a browser. Order matters: Brave and Edge
 * both ship Chrome-shaped user agents, so the specific probes run first.
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
    steps: ['Open the bookmark manager', 'Click the ⋮ menu, top right', 'Choose "Export bookmarks"'],
  },
  brave: {
    label: 'Brave',
    internalUrl: 'brave://bookmarks',
    steps: ['Open the bookmark manager', 'Click the ⋮ menu, top right', 'Choose "Export bookmarks"'],
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
      'Open your browser\'s bookmark manager',
      'Look for an "Export" option',
      'Save the file as HTML',
    ],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/import/__tests__/browserDetect.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write `src/features/import/ExportInstructions.tsx`**

The internal URL is a copy button, never a link — browsers block navigating to
`chrome://` from a page, so a link would be visibly broken.

```tsx
import { useEffect, useState } from 'react';
import { detectBrowser, EXPORT_STEPS, readSignals, type BrowserId } from './browserDetect';

const ALL: BrowserId[] = ['chrome', 'firefox', 'brave', 'edge', 'safari', 'arc', 'opera', 'unknown'];

export function ExportInstructions() {
  const [detected, setDetected] = useState<BrowserId>('unknown');
  const [override, setOverride] = useState<BrowserId | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void readSignals().then((s) => setDetected(detectBrowser(s)));
  }, []);

  const id = override ?? detected;
  const guide = EXPORT_STEPS[id];

  return (
    <section className="rounded-[6px] border border-line bg-surface p-5">
      <h2 className="font-display text-lg">Export your bookmarks from {guide.label}</h2>
      <p className="mt-1 text-sm text-muted">
        A web page can't read your browser's bookmarks directly — no browser exposes that
        to websites. Export them to a file first, then drop it here.
      </p>

      {guide.internalUrl && (
        <div className="mt-4 flex items-center gap-2">
          <code className="rounded-[4px] bg-bg px-2 py-1 font-mono text-sm">{guide.internalUrl}</code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(guide.internalUrl!).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="rounded-[4px] border border-line px-2 py-1 text-xs text-muted transition-colors duration-150 hover:text-text"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <span className="text-xs text-muted">paste into a new tab</span>
        </div>
      )}

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        {guide.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>

      <label className="mt-4 flex items-center gap-2 text-xs text-muted">
        Not your browser?
        <select
          value={id}
          onChange={(e) => setOverride(e.target.value as BrowserId)}
          className="rounded-[4px] border border-line bg-bg px-2 py-1 text-text"
        >
          {ALL.map((b) => <option key={b} value={b}>{EXPORT_STEPS[b].label}</option>)}
        </select>
      </label>
    </section>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add browser detection and per-browser export instructions"
```

---

### Task 10: Netscape bookmark parser

**Files:**
- Create: `src/features/import/parseNetscape.ts`
- Create: `src/features/import/__fixtures__/chrome.html`, `firefox.html`, `malformed.html`
- Test: `src/features/import/__tests__/parseNetscape.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  type ParsedBookmark = {
    url: string; title: string; addedAt: number | null; lastModified: number | null;
    icon: string | null; tags: string[]; description: string | null;
    folderPath: string[];   // root-first, excludes the bookmark itself
  };
  type ParsedFolder = { path: string[]; addDate: number | null; isToolbar: boolean };
  type ParsedFile = {
    bookmarks: ParsedBookmark[];
    folders: ParsedFolder[];
    errors: string[];
    skipped: number;
  };
  function parseNetscape(html: string, parse?: (s: string) => Document): ParsedFile;
  ```

- [ ] **Step 1: Install a DOM for Node tests**

`DOMParser` does not exist in Node. The parser accepts an injected parse function so the
same code runs in the worker (native `DOMParser`) and in tests (`linkedom`).

```bash
pnpm add -D linkedom
```

- [ ] **Step 2: Write `src/features/import/__fixtures__/chrome.html`**

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://react.dev/" ADD_DATE="1700000001" ICON="data:image/png;base64,iVBORw0KGgo=">React</A>
        <DT><H3 ADD_DATE="1700000002">Dev</H3>
        <DL><p>
            <DT><A HREF="https://vite.dev/" ADD_DATE="1700000003">Vite</A>
            <DT><H3 ADD_DATE="1700000004">Tools</H3>
            <DL><p>
                <DT><A HREF="https://esbuild.github.io/" ADD_DATE="1700000005">esbuild</A>
            </DL><p>
        </DL><p>
    </DL><p>
    <DT><H3 ADD_DATE="1700000006">Other bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://example.com/" ADD_DATE="1700000007">Example</A>
    </DL><p>
</DL><p>
```

- [ ] **Step 3: Write `src/features/import/__fixtures__/firefox.html`**

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Toolbar</H3>
    <DL><p>
        <DT><A HREF="place:type=6&amp;sort=14" ADD_DATE="1700000001">Recent Tags</A>
        <DT><A HREF="https://developer.mozilla.org/" ADD_DATE="1700000002" TAGS="docs,web">MDN</A>
        <DD>The Mozilla Developer Network
        <HR>
        <DT><A HREF="https://rust-lang.org/" ADD_DATE="1700000003">Rust</A>
    </DL><p>
</DL><p>
```

- [ ] **Step 4: Write `src/features/import/__fixtures__/malformed.html`**

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Broken
    <DL><p>
        <DT><A HREF="https://good.example/">Fine</A>
        <DT><A>No href at all</A>
        <DT><A HREF="">Empty href</A>
        <DT><A HREF="https://also-good.example/">Also fine</A>
</DL>
```

- [ ] **Step 5: Write the failing test**

```ts
// src/features/import/__tests__/parseNetscape.test.ts
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
    expect(result.bookmarks.map((b) => b.title).sort())
      .toEqual(['Example', 'React', 'Vite', 'esbuild']);
  });

  it('preserves arbitrary folder nesting depth', () => {
    const esbuild = result.bookmarks.find((b) => b.title === 'esbuild');
    expect(esbuild!.folderPath).toEqual(['Bookmarks bar', 'Dev', 'Tools']);
  });

  it('parses ADD_DATE as a unix second timestamp', () => {
    expect(result.bookmarks.find((b) => b.title === 'React')!.addedAt).toBe(1700000001);
  });

  it('captures the ICON data URI', () => {
    expect(result.bookmarks.find((b) => b.title === 'React')!.icon)
      .toBe('data:image/png;base64,iVBORw0KGgo=');
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
    expect(result.bookmarks.find((b) => b.title === 'MDN')!.description)
      .toBe('The Mozilla Developer Network');
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm vitest run src/features/import/__tests__/parseNetscape.test.ts`
Expected: FAIL — cannot resolve `@/features/import/parseNetscape`.

- [ ] **Step 7: Write `src/features/import/parseNetscape.ts`**

Walks the DOM rather than recursing on `<DL>` structure, because malformed exports
routinely omit closing tags — an unclosed `<H3>` must not swallow the rest of the file.

```ts
export type ParsedBookmark = {
  url: string;
  title: string;
  addedAt: number | null;
  lastModified: number | null;
  icon: string | null;
  tags: string[];
  description: string | null;
  /** Root-first folder names, excluding the bookmark itself. */
  folderPath: string[];
};

export type ParsedFolder = {
  path: string[];
  addDate: number | null;
  isToolbar: boolean;
};

export type ParsedFile = {
  bookmarks: ParsedBookmark[];
  folders: ParsedFolder[];
  errors: string[];
  skipped: number;
};

function toTimestamp(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Some exporters write milliseconds or microseconds; normalize to seconds.
  if (n > 1e14) return Math.floor(n / 1e6);
  if (n > 1e11) return Math.floor(n / 1e3);
  return Math.floor(n);
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

const defaultParse = (html: string): Document =>
  new DOMParser().parseFromString(html, 'text/html');

/**
 * Parses the Netscape Bookmark File Format. NEVER throws — every problem is
 * collected into `errors` so one bad entry cannot lose the other 19,999.
 *
 * The DOM parser is injectable so this runs unchanged in a Worker (native
 * DOMParser) and in Node tests (linkedom).
 */
export function parseNetscape(
  html: string,
  parse: (html: string) => Document = defaultParse,
): ParsedFile {
  const bookmarks: ParsedBookmark[] = [];
  const folders: ParsedFolder[] = [];
  const errors: string[] = [];
  let skipped = 0;

  if (html.trim() === '') {
    return { bookmarks, folders, errors: ['The file is empty.'], skipped: 0 };
  }

  let doc: Document;
  try {
    doc = parse(html);
  } catch (e) {
    return {
      bookmarks, folders, skipped: 0,
      errors: [`Could not parse the file as HTML: ${(e as Error).message}`],
    };
  }

  /**
   * Depth is derived from each element's <DL> ancestry rather than from
   * recursion, so unclosed tags degrade locally instead of corrupting the
   * whole tree.
   */
  const pathOf = (el: Element): string[] => {
    const names: string[] = [];
    let current: Element | null = el.parentElement;
    while (current) {
      if (current.tagName === 'DL') {
        // The folder heading is the <H3> of the <DT> that owns this <DL>.
        const owner = current.previousElementSibling ?? current.parentElement;
        const heading = owner?.tagName === 'H3'
          ? owner
          : (owner?.querySelector?.(':scope > h3') ?? null);
        if (heading?.textContent) names.unshift(heading.textContent.trim());
      }
      current = current.parentElement;
    }
    return names;
  };

  try {
    for (const h3 of Array.from(doc.querySelectorAll('h3'))) {
      const name = h3.textContent?.trim();
      if (!name) continue;
      folders.push({
        path: [...pathOf(h3), name],
        addDate: toTimestamp(h3.getAttribute('ADD_DATE') ?? h3.getAttribute('add_date')),
        isToolbar:
          (h3.getAttribute('PERSONAL_TOOLBAR_FOLDER') ??
            h3.getAttribute('personal_toolbar_folder')) === 'true',
      });
    }

    for (const anchor of Array.from(doc.querySelectorAll('a'))) {
      const href = anchor.getAttribute('HREF') ?? anchor.getAttribute('href');

      if (!href || href.trim() === '') { skipped++; continue; }
      // Firefox pseudo-URLs are saved searches, not real bookmarks.
      if (href.startsWith('place:')) { skipped++; continue; }
      if (href.startsWith('javascript:')) { skipped++; continue; }

      const attr = (name: string) =>
        anchor.getAttribute(name.toUpperCase()) ?? anchor.getAttribute(name.toLowerCase());

      // A <DD> description follows its <DT> as a sibling.
      const dt = anchor.closest('dt');
      const next = dt?.nextElementSibling;
      const description =
        next?.tagName === 'DD' ? (next.textContent?.trim() || null) : null;

      bookmarks.push({
        url: href,
        title: anchor.textContent?.trim() || href,
        addedAt: toTimestamp(attr('add_date')),
        lastModified: toTimestamp(attr('last_modified')),
        icon: attr('icon'),
        tags: parseTags(attr('tags')),
        description,
        folderPath: pathOf(anchor),
      });
    }
  } catch (e) {
    errors.push(`Stopped early after an unexpected structure: ${(e as Error).message}`);
  }

  if (bookmarks.length === 0 && errors.length === 0 && doc.querySelectorAll('a').length === 0) {
    errors.push('No bookmarks found. Is this a bookmark export file?');
  }

  return { bookmarks, folders, errors, skipped };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm vitest run src/features/import/__tests__/parseNetscape.test.ts`
Expected: PASS, 14 tests.

If `pathOf` returns wrong paths, debug by logging `result.bookmarks.map(b => b.folderPath)`
against `chrome.html` — the expected value is `['Bookmarks bar','Dev','Tools']` for
esbuild. Adjust the heading lookup, not the fixture.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add netscape bookmark parser with chrome and firefox fixtures"
```

---

### Task 11: Import planning — root stripping, path merging, duplicate classification

**Files:**
- Create: `src/features/import/planImport.ts`
- Test: `src/features/import/__tests__/planImport.test.ts`

**Interfaces:**
- Consumes: `ParsedFile` (Task 10), `normalizeUrl`/`siteOf`/`hashMany` (Task 4)
- Produces:
  ```ts
  type Placement = 'merge' | 'newFolder' | 'flatten';
  type PlanOptions = {
    placement: Placement;
    skipExactDuplicates: boolean;   // default true
    keepExportRoots: boolean;       // default false
  };
  type PlannedBookmark = {
    url: string; normalizedUrl: string; urlHash: string; site: string;
    title: string; description: string | null; icon: string | null;
    tags: string[]; addedAt: number; folderPathKey: string;
  };
  type PlannedFolder = { path: string[]; key: string; existingId: string | null };
  type ImportPlan = {
    bookmarks: PlannedBookmark[];
    folders: PlannedFolder[];
    counts: {
      newBookmarks: number; duplicatesInDb: number; duplicatesInFile: number;
      skipped: number; foldersMerged: number; foldersCreated: number;
    };
    errors: { fileName: string; message: string }[];
  };
  const EXPORT_ROOT_NAMES: readonly string[];
  function pathKey(path: string[]): string;                  // PURE, lowercased join
  function stripExportRoots(path: string[], isToolbar: boolean): string[];  // PURE
  function planImport(
    files: { fileName: string; parsed: ParsedFile }[],
    existing: { folderPathKeys: Map<string, string>; hashes: Set<string> },
    options: PlanOptions,
  ): Promise<ImportPlan>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/features/import/__tests__/planImport.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/import/__tests__/planImport.test.ts`
Expected: FAIL — cannot resolve `@/features/import/planImport`.

- [ ] **Step 3: Write `src/features/import/planImport.ts`**

```ts
import { hashMany, normalizeUrl, siteOf } from '@/lib/url';
import type { ParsedFile } from './parseNetscape';

export type Placement = 'merge' | 'newFolder' | 'flatten';

export type PlanOptions = {
  placement: Placement;
  skipExactDuplicates: boolean;
  keepExportRoots: boolean;
};

export type PlannedBookmark = {
  url: string;
  normalizedUrl: string;
  urlHash: string;
  site: string;
  title: string;
  description: string | null;
  icon: string | null;
  tags: string[];
  addedAt: number;
  /** pathKey of the owning folder; '' means Unsorted. */
  folderPathKey: string;
};

export type PlannedFolder = { path: string[]; key: string; existingId: string | null };

export type ImportPlan = {
  bookmarks: PlannedBookmark[];
  folders: PlannedFolder[];
  counts: {
    newBookmarks: number;
    duplicatesInDb: number;
    duplicatesInFile: number;
    skipped: number;
    foldersMerged: number;
    foldersCreated: number;
  };
  errors: { fileName: string; message: string }[];
};

/** Synthetic roots browsers add to exports; they are containers, not real folders. */
export const EXPORT_ROOT_NAMES: readonly string[] = [
  'bookmarks bar', 'bookmarks toolbar', 'bookmarks menu',
  'other bookmarks', 'other favorites', 'favorites bar', 'mobile bookmarks',
];

/** PURE. Case-insensitive identity for a folder path. */
export function pathKey(path: string[]): string {
  return path.map((p) => p.trim().toLowerCase()).join('\u0000');
}

/**
 * PURE. Drops the browser's synthetic root. `isToolbar` catches localized
 * toolbar names that the English list would miss.
 */
export function stripExportRoots(path: string[], isToolbar: boolean): string[] {
  if (path.length === 0) return path;
  const first = path[0]!.trim().toLowerCase();
  if (EXPORT_ROOT_NAMES.includes(first) || isToolbar) return path.slice(1);
  return path;
}

export async function planImport(
  files: { fileName: string; parsed: ParsedFile }[],
  existing: { folderPathKeys: Map<string, string>; hashes: Set<string> },
  options: PlanOptions,
): Promise<ImportPlan> {
  const errors: { fileName: string; message: string }[] = [];
  const now = Math.floor(Date.now() / 1000);

  let skipped = 0;
  let duplicatesInDb = 0;
  let duplicatesInFile = 0;

  // Collect every candidate with its resolved folder path first, then hash in
  // one batch — per-row awaits would be slow at 20k.
  type Candidate = { parsed: ParsedFile['bookmarks'][number]; path: string[] };
  const candidates: Candidate[] = [];
  const folderPaths = new Map<string, string[]>();

  const toolbarKeys = new Set<string>();
  for (const { parsed } of files) {
    for (const folder of parsed.folders) {
      if (folder.isToolbar) toolbarKeys.add(pathKey(folder.path));
    }
  }

  const resolvePath = (raw: string[], fileName: string): string[] => {
    if (options.placement === 'flatten') return [];

    const isToolbar = raw.length > 0 && toolbarKeys.has(pathKey(raw.slice(0, 1)));
    const stripped = options.keepExportRoots ? raw : stripExportRoots(raw, isToolbar);

    if (options.placement === 'newFolder') {
      return [fileName.replace(/\.html?$/i, ''), ...stripped];
    }
    return stripped;
  };

  for (const { fileName, parsed } of files) {
    skipped += parsed.skipped;
    for (const message of parsed.errors) errors.push({ fileName, message });

    for (const folder of parsed.folders) {
      const path = resolvePath(folder.path, fileName);
      if (path.length > 0) folderPaths.set(pathKey(path), path);
    }

    for (const bookmark of parsed.bookmarks) {
      candidates.push({ parsed: bookmark, path: resolvePath(bookmark.folderPath, fileName) });
    }
  }

  const normalized = candidates.map((c) => normalizeUrl(c.parsed.url));
  const hashes = await hashMany(normalized);

  const seenInFile = new Set<string>();
  const bookmarks: PlannedBookmark[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const normalizedUrl = normalized[i]!;
    const urlHash = hashes[i]!;

    if (options.skipExactDuplicates) {
      if (existing.hashes.has(urlHash)) { duplicatesInDb++; continue; }
      if (seenInFile.has(urlHash)) { duplicatesInFile++; continue; }
    } else if (existing.hashes.has(urlHash)) {
      duplicatesInDb++;
    } else if (seenInFile.has(urlHash)) {
      duplicatesInFile++;
    }
    seenInFile.add(urlHash);

    // Ensure every referenced folder exists in the plan, even when the export
    // declared no <H3> for it.
    if (candidate.path.length > 0) folderPaths.set(pathKey(candidate.path), candidate.path);

    bookmarks.push({
      url: candidate.parsed.url,
      normalizedUrl,
      urlHash,
      site: siteOf(candidate.parsed.url),
      title: candidate.parsed.title,
      description: candidate.parsed.description,
      icon: candidate.parsed.icon,
      tags: candidate.parsed.tags,
      addedAt: candidate.parsed.addedAt ?? now,
      folderPathKey: candidate.path.length > 0 ? pathKey(candidate.path) : '',
    });
  }

  // Every ancestor of a used path must exist too, so the tree has no gaps.
  for (const path of [...folderPaths.values()]) {
    for (let depth = 1; depth < path.length; depth++) {
      const ancestor = path.slice(0, depth);
      folderPaths.set(pathKey(ancestor), ancestor);
    }
  }

  const folders: PlannedFolder[] = [...folderPaths.values()]
    .sort((a, b) => a.length - b.length)
    .map((path) => {
      const key = pathKey(path);
      return { path, key, existingId: existing.folderPathKeys.get(key) ?? null };
    });

  return {
    bookmarks,
    folders,
    counts: {
      newBookmarks: bookmarks.length,
      duplicatesInDb,
      duplicatesInFile,
      skipped,
      foldersMerged: folders.filter((f) => f.existingId !== null).length,
      foldersCreated: folders.filter((f) => f.existingId === null).length,
    },
    errors,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/import/__tests__/planImport.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add import planning with root stripping and duplicate classification"
```

---

### Task 12: Import worker and plan execution

**Files:**
- Create: `src/workers/importWorker.ts`, `src/features/import/workerClient.ts`
- Create: `src/features/import/applyImport.ts`
- Test: `src/features/import/__tests__/applyImport.test.ts`

**Interfaces:**
- Consumes: `parseNetscape` (Task 10), `ImportPlan` (Task 11), repositories (Task 8)
- Produces:
  ```ts
  type WorkerRequest = { id: string; files: { fileName: string; text: string }[] };
  type WorkerResponse =
    | { type: 'progress'; id: string; fileName: string; done: number; total: number }
    | { type: 'result'; id: string; files: { fileName: string; parsed: ParsedFile }[] }
    | { type: 'error'; id: string; message: string };

  function parseFilesInWorker(
    files: { fileName: string; text: string }[],
    onProgress: (done: number, total: number, fileName: string) => void,
  ): Promise<{ fileName: string; parsed: ParsedFile }[]>;

  function applyImport(
    db: Db,
    transaction: <R>(fn: (tx: Tx) => Promise<R>) => Promise<R>,
    plan: ImportPlan,
    meta: { fileName: string; detectedBrowser: SourceBrowser; totalParsed: number },
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ batchId: string; inserted: number }>;
  ```

- [ ] **Step 1: Write `src/workers/importWorker.ts`**

```ts
/// <reference lib="webworker" />
import { parseNetscape, type ParsedFile } from '@/features/import/parseNetscape';

export type WorkerRequest = { id: string; files: { fileName: string; text: string }[] };
export type WorkerResponse =
  | { type: 'progress'; id: string; fileName: string; done: number; total: number }
  | { type: 'result'; id: string; files: { fileName: string; parsed: ParsedFile }[] }
  | { type: 'error'; id: string; message: string };

// Thin transport shell. All parsing logic lives in parseNetscape so it stays
// unit-testable without a worker.
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, files } = event.data;
  const post = (message: WorkerResponse) => self.postMessage(message);

  try {
    const results: { fileName: string; parsed: ParsedFile }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      post({ type: 'progress', id, fileName: file.fileName, done: i, total: files.length });
      results.push({ fileName: file.fileName, parsed: parseNetscape(file.text) });
    }
    post({ type: 'progress', id, fileName: '', done: files.length, total: files.length });
    post({ type: 'result', id, files: results });
  } catch (e) {
    post({ type: 'error', id, message: (e as Error).message });
  }
};
```

- [ ] **Step 2: Write `src/features/import/workerClient.ts`**

```ts
import type { ParsedFile } from './parseNetscape';
import type { WorkerRequest, WorkerResponse } from '@/workers/importWorker';

export function parseFilesInWorker(
  files: { fileName: string; text: string }[],
  onProgress: (done: number, total: number, fileName: string) => void,
): Promise<{ fileName: string; parsed: ParsedFile }[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('@/workers/importWorker.ts', import.meta.url), {
      type: 'module',
    });
    const id = crypto.randomUUID();

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) return;

      if (message.type === 'progress') {
        onProgress(message.done, message.total, message.fileName);
      } else if (message.type === 'result') {
        worker.terminate();
        resolve(message.files);
      } else {
        worker.terminate();
        reject(new Error(message.message));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'The import worker failed.'));
    };

    const request: WorkerRequest = { id, files };
    worker.postMessage(request);
  });
}
```

- [ ] **Step 3: Write the failing test**

```ts
// src/features/import/__tests__/applyImport.test.ts
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
      url: e.url, title: e.title, addedAt: 1700000000, lastModified: null,
      icon: null, tags: [], description: null, folderPath: e.folderPath,
    })),
    folders: [], errors: [], skipped: 0,
  };
}

/** Runs a callback with the test Tx, mirroring the production transaction() shape. */
function makeTransaction(tx: Tx) {
  return <R,>(fn: (t: Tx) => Promise<R>): Promise<R> => fn(tx);
}

describe('applyImport', () => {
  it('creates the folder tree and inserts bookmarks into the right folders', async () => {
    const { db, tx, close } = await freshDb();
    const plan = await planImport(
      [{
        fileName: 'chrome.html',
        parsed: parsedFile([
          { url: 'https://vite.dev', title: 'Vite', folderPath: ['Bookmarks bar', 'Dev', 'Tools'] },
        ]),
      }],
      { folderPathKeys: new Map(), hashes: new Set() },
      OPTIONS,
    );

    const result = await applyImport(db, makeTransaction(tx), plan, {
      fileName: 'chrome.html', detectedBrowser: 'chrome', totalParsed: 1,
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
      [{ fileName: 'chrome.html', parsed: parsedFile([{ url: 'https://a.dev', title: 'A', folderPath: [] }]) }],
      { folderPathKeys: new Map(), hashes: new Set() },
      OPTIONS,
    );
    await applyImport(db, makeTransaction(tx), plan, {
      fileName: 'chrome.html', detectedBrowser: 'chrome', totalParsed: 1,
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
      [{ fileName: 'a.html', parsed: parsedFile([{ url: 'https://a.dev', title: 'A', folderPath: ['Bookmarks bar'] }]) }],
      { folderPathKeys: new Map(), hashes: new Set() },
      OPTIONS,
    );
    await applyImport(db, makeTransaction(tx), plan, {
      fileName: 'a.html', detectedBrowser: 'chrome', totalParsed: 1,
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
      db, makeTransaction(tx),
      await planImport([{ fileName: 'a.html', parsed }], { folderPathKeys: new Map(), hashes: new Set() }, OPTIONS),
      { fileName: 'a.html', detectedBrowser: 'chrome', totalParsed: 1 },
    );

    const afterFirst = await listFolders(db);
    const devId = afterFirst.find((f) => f.name === 'Dev')!.id;

    await applyImport(
      db, makeTransaction(tx),
      await planImport(
        [{ fileName: 'a.html', parsed: parsedFile([{ url: 'https://b.dev', title: 'B', folderPath: ['Dev'] }]) }],
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
      url: `https://example.com/${i}`, title: `B${i}`, folderPath: [],
    }));
    const plan = await planImport(
      [{ fileName: 'big.html', parsed: parsedFile(entries) }],
      { folderPathKeys: new Map(), hashes: new Set() },
      OPTIONS,
    );

    const seen: number[] = [];
    const result = await applyImport(
      db, makeTransaction(tx), plan,
      { fileName: 'big.html', detectedBrowser: 'chrome', totalParsed: 1100 },
      (done) => seen.push(done),
    );

    expect(result.inserted).toBe(1100);
    expect(seen.at(-1)).toBe(1100);
    close();
  });
});
```

- [ ] **Step 4: Write `src/features/import/applyImport.ts`**

```ts
import type { Db, Tx } from '@/db/client';
import type { SourceBrowser, NewBookmark } from '@/db/schema';
import { getSystemFolderId } from '@/db/seed';
import { createFolder } from '@/db/repo/folders';
import { insertBookmarks } from '@/db/repo/bookmarks';
import { recordImportBatch } from '@/db/repo/importBatches';
import { pathKey, type ImportPlan } from './planImport';

const CHUNK = 500;

/**
 * Executes a plan. Folders are created shallowest-first so a parent always
 * exists before its child. Bookmarks land in Unsorted when the plan gives them
 * no folder.
 */
export async function applyImport(
  db: Db,
  transaction: <R>(fn: (tx: Tx) => Promise<R>) => Promise<R>,
  plan: ImportPlan,
  meta: { fileName: string; detectedBrowser: SourceBrowser; totalParsed: number },
  onProgress?: (done: number, total: number) => void,
): Promise<{ batchId: string; inserted: number }> {
  const unsortedId = await getSystemFolderId(db, 'unsorted');
  const idByKey = new Map<string, string>();

  // Shallowest first, so parentId always resolves.
  const ordered = [...plan.folders].sort((a, b) => a.path.length - b.path.length);

  await transaction(async (tx) => {
    for (const folder of ordered) {
      if (folder.existingId) {
        idByKey.set(folder.key, folder.existingId);
        continue;
      }
      const parentKey = folder.path.length > 1 ? pathKey(folder.path.slice(0, -1)) : null;
      const parentId = parentKey ? (idByKey.get(parentKey) ?? null) : null;
      const name = folder.path.at(-1) ?? 'Imported';
      idByKey.set(folder.key, await createFolder(db, tx, { name, parentId }));
    }
  });

  const now = Math.floor(Date.now() / 1000);
  const batchId = crypto.randomUUID();

  const rows: NewBookmark[] = plan.bookmarks.map((bookmark) => ({
    id: crypto.randomUUID(),
    folderId: bookmark.folderPathKey ? (idByKey.get(bookmark.folderPathKey) ?? unsortedId) : unsortedId,
    url: bookmark.url,
    normalizedUrl: bookmark.normalizedUrl,
    urlHash: bookmark.urlHash,
    site: bookmark.site,
    title: bookmark.title,
    description: bookmark.description,
    faviconUrl: bookmark.icon,
    previewImage: null,
    tags: JSON.stringify(bookmark.tags),
    notes: null,
    isPinned: false,
    addedAt: bookmark.addedAt,
    lastOpenedAt: null,
    openCount: 0,
    deletedAt: null,
    sourceBrowser: meta.detectedBrowser,
    importBatchId: batchId,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  }));

  // One transaction per chunk keeps each commit bounded and lets progress
  // advance visibly on a 20k import.
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await transaction((tx) => insertBookmarks(db, tx, slice));
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
  }

  await transaction((tx) =>
    recordImportBatch(db, tx, {
      id: batchId,
      fileName: meta.fileName,
      detectedBrowser: meta.detectedBrowser,
      totalParsed: meta.totalParsed,
      imported: rows.length,
      skippedDuplicates: plan.counts.duplicatesInDb + plan.counts.duplicatesInFile,
      importedAt: now,
    }),
  );

  return { batchId, inserted: rows.length };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/features/import/__tests__/applyImport.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add import worker and plan execution with batched transactions"
```

---

### Task 13: Import UI — drop zone, paste, picker, and preview

**Files:**
- Create: `src/features/import/DropZone.tsx`, `src/features/import/ImportModal.tsx`, `src/features/import/ImportPreview.tsx`
- Create: `src/features/import/useImport.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `parseFilesInWorker`, `planImport`, `applyImport`, `ExportInstructions`
- Produces:
  ```ts
  type ImportStage =
    | { kind: 'idle' }
    | { kind: 'parsing'; done: number; total: number; fileName: string }
    | { kind: 'preview'; plan: ImportPlan; files: { fileName: string; parsed: ParsedFile }[] }
    | { kind: 'writing'; done: number; total: number }
    | { kind: 'done'; inserted: number }
    | { kind: 'error'; message: string };
  function useImport(): {
    stage: ImportStage;
    options: PlanOptions;
    setOptions(next: PlanOptions): void;
    ingest(files: { fileName: string; text: string }[]): Promise<void>;
    apply(): Promise<void>;
    reset(): void;
  };
  ```

- [ ] **Step 1: Write `src/features/import/useImport.ts`**

```ts
import { useCallback, useState } from 'react';
import { db, transaction } from '@/db/client';
import { listFolders } from '@/db/repo/folders';
import { bookmarks as bookmarksTable } from '@/db/schema';
import { detectBrowser, readSignals } from './browserDetect';
import { parseFilesInWorker } from './workerClient';
import { pathKey, planImport, type ImportPlan, type PlanOptions } from './planImport';
import { applyImport } from './applyImport';
import type { ParsedFile } from './parseNetscape';

export type ImportStage =
  | { kind: 'idle' }
  | { kind: 'parsing'; done: number; total: number; fileName: string }
  | { kind: 'preview'; plan: ImportPlan; files: { fileName: string; parsed: ParsedFile }[] }
  | { kind: 'writing'; done: number; total: number }
  | { kind: 'done'; inserted: number }
  | { kind: 'error'; message: string };

const DEFAULT_OPTIONS: PlanOptions = {
  placement: 'merge',
  skipExactDuplicates: true,
  keepExportRoots: false,
};

/** Builds the existing-state snapshot planImport compares against. */
async function readExisting() {
  const folders = await listFolders(db);
  const byId = new Map(folders.map((f) => [f.id, f]));

  const folderPathKeys = new Map<string, string>();
  for (const folder of folders) {
    if (folder.isSystem) continue;
    const path: string[] = [];
    const seen = new Set<string>();
    let current: typeof folder | undefined = folder;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    folderPathKeys.set(pathKey(path), folder.id);
  }

  const rows = await db.select({ urlHash: bookmarksTable.urlHash }).from(bookmarksTable);
  return { folderPathKeys, hashes: new Set(rows.map((r) => r.urlHash)) };
}

export function useImport() {
  const [stage, setStage] = useState<ImportStage>({ kind: 'idle' });
  const [options, setOptionsState] = useState<PlanOptions>(DEFAULT_OPTIONS);
  const [files, setFiles] = useState<{ fileName: string; parsed: ParsedFile }[]>([]);

  const buildPlan = useCallback(
    async (parsedFiles: { fileName: string; parsed: ParsedFile }[], next: PlanOptions) => {
      const existing = await readExisting();
      const plan = await planImport(parsedFiles, existing, next);
      setStage({ kind: 'preview', plan, files: parsedFiles });
    },
    [],
  );

  const ingest = useCallback(
    async (input: { fileName: string; text: string }[]) => {
      if (input.length === 0) return;
      try {
        setStage({ kind: 'parsing', done: 0, total: input.length, fileName: '' });
        const parsedFiles = await parseFilesInWorker(input, (done, total, fileName) =>
          setStage({ kind: 'parsing', done, total, fileName }),
        );
        setFiles(parsedFiles);
        await buildPlan(parsedFiles, options);
      } catch (e) {
        setStage({ kind: 'error', message: (e as Error).message });
      }
    },
    [buildPlan, options],
  );

  // Re-planning is pure and fast, so changing an option re-runs it immediately.
  const setOptions = useCallback(
    (next: PlanOptions) => {
      setOptionsState(next);
      if (files.length > 0) void buildPlan(files, next);
    },
    [buildPlan, files],
  );

  const apply = useCallback(async () => {
    if (stage.kind !== 'preview') return;
    const { plan } = stage;
    try {
      setStage({ kind: 'writing', done: 0, total: plan.bookmarks.length });
      const browser = detectBrowser(await readSignals());
      const totalParsed = files.reduce((sum, f) => sum + f.parsed.bookmarks.length, 0);
      const { inserted } = await applyImport(
        db,
        transaction,
        plan,
        {
          fileName: files.map((f) => f.fileName).join(', '),
          detectedBrowser: browser,
          totalParsed,
        },
        (done, total) => setStage({ kind: 'writing', done, total }),
      );
      setStage({ kind: 'done', inserted });
    } catch (e) {
      setStage({ kind: 'error', message: (e as Error).message });
    }
  }, [files, stage]);

  const reset = useCallback(() => {
    setFiles([]);
    setStage({ kind: 'idle' });
  }, []);

  return { stage, options, setOptions, ingest, apply, reset };
}
```

- [ ] **Step 2: Write `src/features/import/DropZone.tsx`**

Covers all three input paths from the spec: drop, picker, and paste.

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = { onFiles: (files: { fileName: string; text: string }[]) => void };

const ACCEPTED = /\.(html?|htm)$/i;

export function DropZone({ onFiles }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFiles = useCallback(
    async (list: FileList | null) => {
      if (!list) return;
      const accepted = [...list].filter((f) => ACCEPTED.test(f.name));
      if (accepted.length === 0) return;
      onFiles(
        await Promise.all(
          accepted.map(async (f) => ({ fileName: f.name, text: await f.text() })),
        ),
      );
    },
    [onFiles],
  );

  // Full-window drop target.
  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const leave = (e: DragEvent) => {
      e.preventDefault();
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void readFiles(e.dataTransfer?.files ?? null);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [readFiles]);

  // Ctrl+V of raw bookmark HTML.
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/html') || e.clipboardData?.getData('text/plain');
      if (text && /<\s*a\s[^>]*href/i.test(text)) {
        e.preventDefault();
        onFiles([{ fileName: 'pasted.html', text }]);
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [onFiles]);

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-[6px] border-2 border-dashed border-line bg-surface p-10 text-center transition-colors duration-150 hover:border-accent"
      >
        <span className="block font-display text-lg">Drop your bookmark files here</span>
        <span className="mt-1 block text-sm text-muted">
          or click to choose files, or paste bookmark HTML with Ctrl+V
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".html,.htm"
        className="hidden"
        onChange={(e) => void readFiles(e.target.files)}
      />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-sm">
          <p className="rounded-[6px] border-2 border-dashed border-accent bg-surface px-8 py-6 font-display text-xl">
            Release to import
          </p>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Write `src/features/import/ImportPreview.tsx`**

Nothing is written until Apply. Every count from the plan is shown.

```tsx
import type { ImportPlan, PlanOptions, Placement } from './planImport';

type Props = {
  plan: ImportPlan;
  options: PlanOptions;
  onOptions: (next: PlanOptions) => void;
  onApply: () => void;
  onCancel: () => void;
};

const PLACEMENTS: { value: Placement; label: string; hint: string }[] = [
  { value: 'merge', label: 'Merge into my folders', hint: 'Match folders by name and path' },
  { value: 'newFolder', label: 'New folder per file', hint: 'Nest everything under the file name' },
  { value: 'flatten', label: 'Flatten into Unsorted', hint: 'Ignore the imported folder structure' },
];

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'accent' | 'muted' }) {
  return (
    <div className="rounded-[6px] border border-line bg-bg p-3">
      <div className={`font-display text-2xl tabular-nums ${tone === 'accent' ? 'text-accent' : ''}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

export function ImportPreview({ plan, options, onOptions, onApply, onCancel }: Props) {
  const { counts } = plan;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Review before importing</h2>
        <p className="mt-1 text-sm text-muted">Nothing is saved until you press Import.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="New bookmarks" value={counts.newBookmarks} tone="accent" />
        <Stat label="Already in your library" value={counts.duplicatesInDb} />
        <Stat label="Duplicated in the files" value={counts.duplicatesInFile} />
        <Stat label="Skipped entries" value={counts.skipped} />
      </div>

      <p className="text-sm text-muted">
        {counts.foldersMerged.toLocaleString()} folders merge into your existing tree,{' '}
        {counts.foldersCreated.toLocaleString()} will be created.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Where should these go?</legend>
        {PLACEMENTS.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded-[6px] border border-line p-3 has-checked:border-accent">
            <input
              type="radio"
              name="placement"
              checked={options.placement === option.value}
              onChange={() => onOptions({ ...options, placement: option.value })}
              className="mt-1"
            />
            <span>
              <span className="block text-sm">{option.label}</span>
              <span className="block text-xs text-muted">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={options.skipExactDuplicates}
            onChange={(e) => onOptions({ ...options, skipExactDuplicates: e.target.checked })}
          />
          Skip exact duplicates
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={options.keepExportRoots}
            onChange={(e) => onOptions({ ...options, keepExportRoots: e.target.checked })}
          />
          Keep browser export roots ("Bookmarks bar", "Other bookmarks")
        </label>
      </div>

      {plan.errors.length > 0 && (
        <details className="rounded-[6px] border border-line p-3">
          <summary className="cursor-pointer text-sm">
            {plan.errors.length} file {plan.errors.length === 1 ? 'issue' : 'issues'}
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {plan.errors.map((e, i) => (
              <li key={i}><span className="font-mono">{e.fileName}</span>: {e.message}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex gap-2">
        <button
          onClick={onApply}
          disabled={counts.newBookmarks === 0}
          className="rounded-[6px] bg-accent px-4 py-2 text-sm text-white transition-opacity duration-150 disabled:opacity-40"
        >
          Import {counts.newBookmarks.toLocaleString()} bookmarks
        </button>
        <button onClick={onCancel} className="rounded-[6px] border border-line px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/features/import/ImportModal.tsx`**

```tsx
import { ExportInstructions } from './ExportInstructions';
import { DropZone } from './DropZone';
import { ImportPreview } from './ImportPreview';
import { useImport } from './useImport';

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full bg-accent transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ImportModal({ onDone }: { onDone: () => void }) {
  const { stage, options, setOptions, ingest, apply, reset } = useImport();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      {stage.kind === 'idle' && (
        <>
          <ExportInstructions />
          <DropZone onFiles={(files) => void ingest(files)} />
        </>
      )}

      {stage.kind === 'parsing' && (
        <Progress done={stage.done} total={stage.total} label={`Reading ${stage.fileName || 'files'}…`} />
      )}

      {stage.kind === 'preview' && (
        <ImportPreview
          plan={stage.plan}
          options={options}
          onOptions={setOptions}
          onApply={() => void apply()}
          onCancel={reset}
        />
      )}

      {stage.kind === 'writing' && (
        <Progress done={stage.done} total={stage.total} label="Saving bookmarks…" />
      )}

      {stage.kind === 'done' && (
        <div className="space-y-4 text-center">
          <p className="font-display text-2xl">
            Imported {stage.inserted.toLocaleString()} bookmarks
          </p>
          <button onClick={onDone} className="rounded-[6px] bg-accent px-4 py-2 text-sm text-white">
            View your library
          </button>
        </div>
      )}

      {stage.kind === 'error' && (
        <div className="space-y-3 rounded-[6px] border border-line p-5">
          <p className="font-display text-lg">The import didn't finish</p>
          <p className="text-sm text-muted">{stage.message}</p>
          <button onClick={reset} className="rounded-[6px] border border-line px-3 py-1.5 text-sm">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify end-to-end with a real export**

Wire `ImportModal` into `App.tsx`. Run `pnpm dev`, then export your own bookmarks and
import them. Verify: progress advances, the preview counts look right, Apply writes, and
a hard refresh shows the data still there. Then **import the same file again** — expected:
every bookmark reports as a duplicate and `foldersCreated` is 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add import UI with drop zone, paste, preview, and progress"
```

---

## Phase 4 — Core UI

### Task 14: Folder tree sidebar

**Files:**
- Create: `src/features/folders/FolderTree.tsx`, `src/features/folders/useFolders.ts`
- Modify: `src/stores/ui.ts` (add tree + filter state)
- Test: `src/stores/__tests__/ui.test.ts` (extend)

**Interfaces:**
- Consumes: `listFolders`, `buildTree`, `countsByFolder`, `rollupCounts`
- Produces:
  ```ts
  // added to useUiStore
  expandedFolders: Set<string>;
  activeFolderId: string | null;
  includeSubfolderCounts: boolean;
  toggleFolderExpanded(id: string): void;
  setActiveFolder(id: string | null): void;
  toggleSubfolderCounts(): void;

  // useFolders.ts
  function useFolders(): {
    tree: FolderNode[]; rows: Folder[]; counts: Map<string, number>; reload(): Promise<void>;
  };
  ```

- [ ] **Step 1: Extend the ui store test**

```ts
// append to src/stores/__tests__/ui.test.ts
describe('folder tree state', () => {
  beforeEach(() => useUiStore.getState().resetForTest());

  it('toggles expansion per folder', () => {
    useUiStore.getState().toggleFolderExpanded('a');
    expect(useUiStore.getState().expandedFolders.has('a')).toBe(true);
    useUiStore.getState().toggleFolderExpanded('a');
    expect(useUiStore.getState().expandedFolders.has('a')).toBe(false);
  });

  it('tracks the active folder', () => {
    useUiStore.getState().setActiveFolder('f1');
    expect(useUiStore.getState().activeFolderId).toBe('f1');
  });

  it('defaults to including subfolder counts', () => {
    expect(useUiStore.getState().includeSubfolderCounts).toBe(true);
  });
});
```

- [ ] **Step 2: Extend `src/stores/ui.ts`**

`Set` is not JSON-serializable, so the persist middleware needs an explicit
serializer for `expandedFolders`.

```ts
// Add to the UiState type:
//   expandedFolders: Set<string>;
//   activeFolderId: string | null;
//   includeSubfolderCounts: boolean;
//   toggleFolderExpanded: (id: string) => void;
//   setActiveFolder: (id: string | null) => void;
//   toggleSubfolderCounts: () => void;
//
// Add to INITIAL:
//   expandedFolders: new Set<string>(),
//   activeFolderId: null,
//   includeSubfolderCounts: true,
//
// Add to the store body:
      toggleFolderExpanded: (id) =>
        set((s) => {
          const next = new Set(s.expandedFolders);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { expandedFolders: next };
        }),
      setActiveFolder: (activeFolderId) => set({ activeFolderId }),
      toggleSubfolderCounts: () =>
        set((s) => ({ includeSubfolderCounts: !s.includeSubfolderCounts })),

// Replace the persist config with one that can round-trip the Set:
    {
      name: 'bookmarks.ui',
      partialize: (s) => ({ ...s, expandedFolders: [...s.expandedFolders] }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<UiState> & { expandedFolders?: string[] };
        return {
          ...current,
          ...saved,
          expandedFolders: new Set(saved.expandedFolders ?? []),
        };
      },
    },
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm vitest run src/stores/__tests__/ui.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 4: Write `src/features/folders/useFolders.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import { db } from '@/db/client';
import { buildTree, listFolders, type FolderNode } from '@/db/repo/folders';
import { countsByFolder, rollupCounts } from '@/db/repo/bookmarks';
import { useUiStore } from '@/stores/ui';
import type { Folder } from '@/db/schema';

export function useFolders() {
  const [rows, setRows] = useState<Folder[]>([]);
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const includeSubfolders = useUiStore((s) => s.includeSubfolderCounts);

  const reload = useCallback(async () => {
    const folders = await listFolders(db);
    const built = buildTree(folders);
    const direct = await countsByFolder(db);
    setRows(folders);
    setTree(built);
    setCounts(includeSubfolders ? rollupCounts(built, direct) : direct);
  }, [includeSubfolders]);

  useEffect(() => { void reload(); }, [reload]);

  return { tree, rows, counts, reload };
}
```

- [ ] **Step 5: Write `src/features/folders/FolderTree.tsx`**

Uses correct ARIA tree semantics and roving keyboard navigation.

```tsx
import { useUiStore } from '@/stores/ui';
import type { FolderNode } from '@/db/repo/folders';
import { useFolders } from './useFolders';

function Row({ node, counts }: { node: FolderNode; counts: Map<string, number> }) {
  const { expandedFolders, activeFolderId, toggleFolderExpanded, setActiveFolder } = useUiStore();
  const expanded = expandedFolders.has(node.id);
  const hasChildren = node.children.length > 0;
  const active = activeFolderId === node.id;
  const count = counts.get(node.id) ?? 0;

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        onClick={() => setActiveFolder(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && hasChildren && !expanded) toggleFolderExpanded(node.id);
          else if (e.key === 'ArrowLeft' && hasChildren && expanded) toggleFolderExpanded(node.id);
          else if (e.key === 'Enter' || e.key === ' ') setActiveFolder(node.id);
          else return;
          e.preventDefault();
        }}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        className={`flex cursor-pointer items-center gap-1.5 rounded-[4px] py-1 pr-2 text-sm transition-colors duration-150 ${
          active ? 'bg-accent/12 text-accent' : 'hover:bg-line/40'
        }`}
      >
        {hasChildren ? (
          <button
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={(e) => { e.stopPropagation(); toggleFolderExpanded(node.id); }}
            className="w-4 shrink-0 text-muted"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {node.icon && <span aria-hidden>{node.icon}</span>}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {count > 0 && <span className="shrink-0 text-xs tabular-nums text-muted">{count}</span>}
      </div>

      {hasChildren && expanded && (
        <ul role="group">
          {node.children.map((child) => (
            <Row key={child.id} node={child} counts={counts} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FolderTree() {
  const { tree, counts } = useFolders();
  const { includeSubfolderCounts, toggleSubfolderCounts, setActiveFolder, activeFolderId } =
    useUiStore();

  return (
    <nav className="p-2">
      <div
        role="treeitem"
        aria-selected={activeFolderId === null}
        tabIndex={0}
        onClick={() => setActiveFolder(null)}
        className={`mb-1 cursor-pointer rounded-[4px] px-2 py-1 text-sm ${
          activeFolderId === null ? 'bg-accent/12 text-accent' : 'hover:bg-line/40'
        }`}
      >
        All bookmarks
      </div>

      <ul role="tree" aria-label="Folders">
        {tree.map((node) => <Row key={node.id} node={node} counts={counts} />)}
      </ul>

      <label className="mt-3 flex items-center gap-2 px-2 text-xs text-muted">
        <input type="checkbox" checked={includeSubfolderCounts} onChange={toggleSubfolderCounts} />
        Count subfolders
      </label>
    </nav>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run `pnpm dev` after importing. Expected: the imported hierarchy renders at correct
depths, counts appear, expansion survives a refresh, and arrow keys expand/collapse.

```bash
git add -A
git commit -m "feat: add accessible folder tree with persisted expansion and counts"
```

---

### Task 15: Selection model and virtualized bookmark list

**Files:**
- Create: `src/features/library/selection.ts`, `src/features/library/BookmarkList.tsx`
- Create: `src/features/library/BookmarkRow.tsx`, `src/features/library/useBookmarks.ts`
- Modify: `src/stores/ui.ts`
- Test: `src/features/library/__tests__/selection.test.ts`

**Interfaces:**
- Consumes: `listBookmarks`, `recordOpen`, ui store
- Produces:
  ```ts
  // selection.ts — PURE
  type SelectionState = { selectedIds: Set<string>; anchorId: string | null };
  type ClickModifiers = { shift: boolean; meta: boolean };
  function applyClick(
    state: SelectionState, id: string, orderedIds: string[], mods: ClickModifiers,
  ): SelectionState;

  // added to useUiStore
  selectedIds: Set<string>; anchorId: string | null;
  clickBookmark(id: string, orderedIds: string[], mods: ClickModifiers): void;
  clearSelection(): void;
  selectAll(orderedIds: string[]): void;

  // useBookmarks.ts
  function useBookmarks(): { rows: Bookmark[]; loading: boolean; reload(): Promise<void> };
  ```

- [ ] **Step 1: Write the failing selection test**

The selection model is pure, so every modifier combination is testable without React.

```ts
// src/features/library/__tests__/selection.test.ts
import { describe, expect, it } from 'vitest';
import { applyClick } from '@/features/library/selection';

const ORDER = ['a', 'b', 'c', 'd', 'e'];
const EMPTY = { selectedIds: new Set<string>(), anchorId: null };
const plain = { shift: false, meta: false };

describe('applyClick', () => {
  it('a plain click selects exactly one and sets the anchor', () => {
    const next = applyClick(EMPTY, 'c', ORDER, plain);
    expect([...next.selectedIds]).toEqual(['c']);
    expect(next.anchorId).toBe('c');
  });

  it('a plain click replaces an existing multi-selection', () => {
    const state = { selectedIds: new Set(['a', 'b']), anchorId: 'a' };
    expect([...applyClick(state, 'd', ORDER, plain).selectedIds]).toEqual(['d']);
  });

  it('meta-click toggles an item without clearing the rest', () => {
    const state = { selectedIds: new Set(['a']), anchorId: 'a' };
    const added = applyClick(state, 'c', ORDER, { shift: false, meta: true });
    expect([...added.selectedIds].sort()).toEqual(['a', 'c']);

    const removed = applyClick(added, 'a', ORDER, { shift: false, meta: true });
    expect([...removed.selectedIds]).toEqual(['c']);
  });

  it('shift-click selects the inclusive range from the anchor', () => {
    const state = { selectedIds: new Set(['b']), anchorId: 'b' };
    const next = applyClick(state, 'd', ORDER, { shift: true, meta: false });
    expect([...next.selectedIds].sort()).toEqual(['b', 'c', 'd']);
  });

  it('shift-click works backwards', () => {
    const state = { selectedIds: new Set(['d']), anchorId: 'd' };
    const next = applyClick(state, 'b', ORDER, { shift: true, meta: false });
    expect([...next.selectedIds].sort()).toEqual(['b', 'c', 'd']);
  });

  it('keeps the anchor fixed across successive shift-clicks', () => {
    const state = { selectedIds: new Set(['b']), anchorId: 'b' };
    const first = applyClick(state, 'd', ORDER, { shift: true, meta: false });
    const second = applyClick(first, 'c', ORDER, { shift: true, meta: false });
    expect(second.anchorId).toBe('b');
    expect([...second.selectedIds].sort()).toEqual(['b', 'c']);
  });

  it('shift-click with no anchor behaves like a plain click', () => {
    const next = applyClick(EMPTY, 'c', ORDER, { shift: true, meta: false });
    expect([...next.selectedIds]).toEqual(['c']);
  });

  it('ignores an id missing from the current order', () => {
    const state = { selectedIds: new Set(['b']), anchorId: 'b' };
    const next = applyClick(state, 'zz', ORDER, { shift: true, meta: false });
    expect([...next.selectedIds]).toEqual(['zz']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/library/__tests__/selection.test.ts`
Expected: FAIL — cannot resolve `@/features/library/selection`.

- [ ] **Step 3: Write `src/features/library/selection.ts`**

```ts
export type SelectionState = { selectedIds: Set<string>; anchorId: string | null };
export type ClickModifiers = { shift: boolean; meta: boolean };

/**
 * PURE. Anchor-plus-set model, shaped so Milestone 2 can drag a whole
 * selection without reworking it.
 */
export function applyClick(
  state: SelectionState,
  id: string,
  orderedIds: string[],
  mods: ClickModifiers,
): SelectionState {
  if (mods.meta) {
    const next = new Set(state.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selectedIds: next, anchorId: id };
  }

  if (mods.shift && state.anchorId) {
    const from = orderedIds.indexOf(state.anchorId);
    const to = orderedIds.indexOf(id);
    // A missing anchor or target means the list changed under us; fall back
    // to a plain selection rather than selecting a wrong range.
    if (from === -1 || to === -1) return { selectedIds: new Set([id]), anchorId: id };
    const [start, end] = from <= to ? [from, to] : [to, from];
    return {
      selectedIds: new Set(orderedIds.slice(start, end + 1)),
      // The anchor stays put so successive shift-clicks re-range from it.
      anchorId: state.anchorId,
    };
  }

  return { selectedIds: new Set([id]), anchorId: id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/library/__tests__/selection.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add selection to `src/stores/ui.ts`**

```ts
// Add these imports at the top of src/stores/ui.ts:
import { applyClick, type ClickModifiers } from '@/features/library/selection';

// Add to UiState:
//   selectedIds: Set<string>;
//   anchorId: string | null;
//   clickBookmark: (id: string, orderedIds: string[], mods: ClickModifiers) => void;
//   clearSelection: () => void;
//   selectAll: (orderedIds: string[]) => void;
//
// Add to INITIAL: selectedIds: new Set<string>(), anchorId: null,
//
// Add to the store body:
      clickBookmark: (id, orderedIds, mods) =>
        set((s) => applyClick({ selectedIds: s.selectedIds, anchorId: s.anchorId }, id, orderedIds, mods)),
      clearSelection: () => set({ selectedIds: new Set<string>(), anchorId: null }),
      selectAll: (orderedIds) => set({ selectedIds: new Set(orderedIds) }),
```

Selection is transient, so exclude it from `partialize` — a refresh should not restore a
stale selection.

- [ ] **Step 6: Install the virtualizer and write `src/features/library/useBookmarks.ts`**

```bash
pnpm add @tanstack/react-virtual@3.14.8
```

```ts
import { useCallback, useEffect, useState } from 'react';
import { db } from '@/db/client';
import { listBookmarks, type BookmarkFilter } from '@/db/repo/bookmarks';
import { useUiStore } from '@/stores/ui';
import type { Bookmark } from '@/db/schema';

// Module-level constant, NOT a default `{}` argument: a fresh object literal
// each render would change the useCallback identity every time and spin the
// effect in an infinite loop.
const NO_EXTRA_FILTER: BookmarkFilter = {};

export function useBookmarks(extraFilter: BookmarkFilter = NO_EXTRA_FILTER) {
  const [rows, setRows] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const activeFolderId = useUiStore((s) => s.activeFolderId);
  const sortKey = useUiStore((s) => s.sortKey);
  const sortDir = useUiStore((s) => s.sortDir);

  const reload = useCallback(async () => {
    setLoading(true);
    const filter: BookmarkFilter = {
      ...extraFilter,
      ...(activeFolderId ? { folderId: activeFolderId } : {}),
    };
    setRows(await listBookmarks(db, filter, { key: sortKey, dir: sortDir }));
    setLoading(false);
    // Callers must pass a referentially stable filter (a module constant or a
    // useMemo result), never an inline literal.
  }, [activeFolderId, sortKey, sortDir, extraFilter]);

  useEffect(() => { void reload(); }, [reload]);

  return { rows, loading, reload };
}
```

- [ ] **Step 7: Write `src/features/library/BookmarkRow.tsx`**

```tsx
import type { Bookmark } from '@/db/schema';

type Props = {
  bookmark: Bookmark;
  selected: boolean;
  compact: boolean;
  onClick: (e: React.MouseEvent) => void;
  onOpen: () => void;
};

export function BookmarkRow({ bookmark, selected, compact, onClick, onOpen }: Props) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onClick={onClick}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className={`flex h-full cursor-pointer items-center gap-3 border-b border-line/60 px-4 transition-colors duration-150 ${
        selected ? 'bg-accent/12' : 'hover:bg-line/25'
      }`}
    >
      {bookmark.faviconUrl ? (
        // Imported ICON data URIs only — no network request is made here.
        <img src={bookmark.faviconUrl} alt="" width={16} height={16} className="shrink-0 rounded-[2px]" />
      ) : (
        <span aria-hidden className="h-4 w-4 shrink-0 rounded-[2px] bg-line" />
      )}

      <span className="min-w-0 flex-1 truncate text-sm">{bookmark.title}</span>

      {!compact && (
        <span className="hidden shrink-0 text-xs text-muted sm:block">{bookmark.site}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Write `src/features/library/BookmarkList.tsx`**

```tsx
import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { db, transaction } from '@/db/client';
import { recordOpen } from '@/db/repo/bookmarks';
import { useUiStore } from '@/stores/ui';
import { useBookmarks } from './useBookmarks';
import { BookmarkRow } from './BookmarkRow';

const ROW_HEIGHT = { comfortable: 48, compact: 32 } as const;

export function BookmarkList() {
  const parentRef = useRef<HTMLDivElement>(null);
  const { rows, loading } = useBookmarks();
  const { selectedIds, clickBookmark, density } = useUiStore();

  const orderedIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const size = ROW_HEIGHT[density];

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => size,
    overscan: 12,
  });

  const open = (url: string, id: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    void transaction((tx) => recordOpen(db, tx, id));
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="h-8 animate-pulse rounded-[4px] bg-line/50" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="font-display text-lg">Nothing here yet</p>
        <p className="max-w-sm text-sm text-muted">
          Import a bookmark export to fill this folder, or pick a different one in the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        role="listbox"
        aria-label="Bookmarks"
        aria-multiselectable="true"
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const bookmark = rows[item.index]!;
          return (
            <div
              key={bookmark.id}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%',
                height: item.size, transform: `translateY(${item.start}px)`,
              }}
            >
              <BookmarkRow
                bookmark={bookmark}
                selected={selectedIds.has(bookmark.id)}
                compact={density === 'compact'}
                onClick={(e) =>
                  clickBookmark(bookmark.id, orderedIds, {
                    shift: e.shiftKey,
                    meta: e.metaKey || e.ctrlKey,
                  })
                }
                onOpen={() => open(bookmark.url, bookmark.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Verify and commit**

Run `pnpm dev` with a large import loaded. Expected: scrolling stays smooth, shift-range
and ctrl-toggle selection behave, double-click opens a new tab, and the density toggle
changes row height.

```bash
git add -A
git commit -m "feat: add selection model and virtualized bookmark list"
```

---

### Task 16: Detail pane, filters, sorting, and view modes

**Files:**
- Create: `src/features/library/DetailPane.tsx`, `src/features/library/FilterBar.tsx`
- Create: `src/features/library/BookmarkCard.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `folderPath`, `listBookmarks`, `useUiStore`, `normalizeUrl`
- Produces: the assembled three-pane application

- [ ] **Step 1: Write `src/features/library/DetailPane.tsx`**

Tier 1 only — everything here works offline. No iframe, no metadata fetch.

```tsx
import { useEffect, useState } from 'react';
import { db } from '@/db/client';
import { listBookmarks } from '@/db/repo/bookmarks';
import { folderPath, listFolders } from '@/db/repo/folders';
import { normalizeUrl } from '@/lib/url';
import type { Bookmark } from '@/db/schema';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-3">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

export function DetailPane({ bookmark }: { bookmark: Bookmark | null }) {
  const [path, setPath] = useState<string[]>([]);
  const [sameSite, setSameSite] = useState<Bookmark[]>([]);

  useEffect(() => {
    if (!bookmark) { setPath([]); setSameSite([]); return; }
    void (async () => {
      const folders = await listFolders(db);
      setPath(bookmark.folderId ? folderPath(folders, bookmark.folderId) : []);
      const siblings = await listBookmarks(
        db, { site: bookmark.site }, { key: 'title', dir: 'asc' },
      );
      setSameSite(siblings.filter((b) => b.id !== bookmark.id));
    })();
  }, [bookmark]);

  if (!bookmark) {
    return (
      <div className="p-6 text-sm text-muted">
        Select a bookmark to see its details.
      </div>
    );
  }

  const normalized = normalizeUrl(bookmark.url);
  const tags = JSON.parse(bookmark.tags) as string[];

  return (
    <div className="p-5">
      <h2 className="font-display text-lg leading-snug">{bookmark.title}</h2>
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block truncate text-sm text-accent underline-offset-2 hover:underline"
      >
        {bookmark.url}
      </a>

      <dl className="mt-4">
        {normalized !== bookmark.url && (
          <Field label="Compared as">
            <code className="font-mono text-xs">{normalized}</code>
            <p className="mt-1 text-xs text-muted">
              Tracking parameters and formatting differences are ignored when checking for
              duplicates. Your original link is stored unchanged.
            </p>
          </Field>
        )}
        <Field label="Site">{bookmark.site || 'Unknown'}</Field>
        <Field label="Folder">{path.length > 0 ? path.join(' / ') : 'Unsorted'}</Field>
        <Field label="Added">
          {new Date(bookmark.addedAt * 1000).toLocaleDateString()}
        </Field>
        <Field label="Opened">
          {bookmark.openCount === 0
            ? 'Never'
            : `${bookmark.openCount}× — last ${new Date((bookmark.lastOpenedAt ?? 0) * 1000).toLocaleDateString()}`}
        </Field>
        <Field label="From">{bookmark.sourceBrowser ?? 'Unknown'}</Field>
        {tags.length > 0 && (
          <Field label="Tags">
            <span className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <span key={t} className="rounded-[4px] bg-line/60 px-1.5 py-0.5 text-xs">{t}</span>
              ))}
            </span>
          </Field>
        )}
        {bookmark.description && <Field label="Description">{bookmark.description}</Field>}
      </dl>

      {sameSite.length > 0 && (
        <section className="mt-5 border-t border-line pt-4">
          <h3 className="text-xs uppercase tracking-wide text-muted">
            {sameSite.length} more on {bookmark.site}
          </h3>
          <ul className="mt-2 space-y-1">
            {sameSite.slice(0, 20).map((b) => (
              <li key={b.id} className="truncate text-sm">{b.title}</li>
            ))}
          </ul>
          {sameSite.length > 20 && (
            <p className="mt-2 text-xs text-muted">…and {sameSite.length - 20} more</p>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/features/library/FilterBar.tsx`**

```tsx
import { useUiStore, type SortKey, type ViewMode, type Density } from '@/stores/ui';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'addedAt', label: 'Date added' },
  { value: 'title', label: 'Title' },
  { value: 'lastOpenedAt', label: 'Last opened' },
  { value: 'openCount', label: 'Times opened' },
  { value: 'site', label: 'Site' },
  { value: 'manual', label: 'Manual order' },
];

const VIEWS: ViewMode[] = ['list', 'compact', 'cards'];
const DENSITIES: Density[] = ['comfortable', 'compact'];

export function FilterBar({ count }: { count: number }) {
  const { sortKey, sortDir, setSort, viewMode, setViewMode, density, setDensity } = useUiStore();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-sm">
      <span className="tabular-nums text-muted">{count.toLocaleString()} bookmarks</span>

      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
        Sort
        <select
          value={sortKey}
          onChange={(e) => setSort(e.target.value as SortKey, sortDir)}
          className="rounded-[4px] border border-line bg-bg px-1.5 py-1 text-text"
        >
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>

      <button
        onClick={() => setSort(sortKey, sortDir === 'asc' ? 'desc' : 'asc')}
        aria-label={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
        className="rounded-[4px] border border-line px-1.5 py-1 text-xs"
      >
        {sortDir === 'asc' ? '↑' : '↓'}
      </button>

      <div role="radiogroup" aria-label="View mode" className="flex gap-0.5">
        {VIEWS.map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={viewMode === v}
            onClick={() => setViewMode(v)}
            className={`rounded-[4px] px-2 py-1 text-xs capitalize ${
              viewMode === v ? 'bg-accent text-white' : 'text-muted hover:text-text'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <button
        onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
        className="rounded-[4px] border border-line px-2 py-1 text-xs capitalize"
      >
        {DENSITIES.find((d) => d !== density)}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/features/library/BookmarkCard.tsx`**

```tsx
import type { Bookmark } from '@/db/schema';

type Props = { bookmark: Bookmark; selected: boolean; onClick: (e: React.MouseEvent) => void; onOpen: () => void };

export function BookmarkCard({ bookmark, selected, onClick, onOpen }: Props) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onOpen}
      className={`flex cursor-pointer flex-col overflow-hidden rounded-[6px] border transition-colors duration-150 ${
        selected ? 'border-accent bg-accent/8' : 'border-line bg-surface hover:border-accent/50'
      }`}
    >
      <div className="flex h-24 items-center justify-center bg-bg">
        {bookmark.previewImage ? (
          <img src={bookmark.previewImage} alt="" className="h-full w-full object-cover" />
        ) : bookmark.faviconUrl ? (
          <img src={bookmark.faviconUrl} alt="" width={28} height={28} />
        ) : (
          <span aria-hidden className="font-display text-2xl text-muted">
            {bookmark.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm">{bookmark.title}</p>
        <p className="mt-1 truncate text-xs text-muted">{bookmark.site}</p>
      </div>
    </div>
  );
}
```

Then add the grid branch to `BookmarkList`. The grid virtualizes *rows* of `columns`
cards, so 20,000 cards still mount only the visible band. `viewMode === 'compact'` needs
no branch — it maps to the compact row height the list already supports.

```tsx
// Add to src/features/library/BookmarkList.tsx

import { useEffect, useState } from 'react';
import { BookmarkCard } from './BookmarkCard';

const CARD_MIN_WIDTH = 200;
const CARD_HEIGHT = 190;
const GRID_GAP = 12;

/** Tracks the container width so the column count reflows with the pane. */
function useColumnCount(ref: React.RefObject<HTMLDivElement | null>): number {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setColumns(Math.max(1, Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return columns;
}
```

Inside `BookmarkList`, call `const columns = useColumnCount(parentRef);` alongside the
existing hooks, then build a second virtualizer and branch on `viewMode`:

```tsx
  const viewMode = useUiStore((s) => s.viewMode);
  const columns = useColumnCount(parentRef);
  const rowCount = Math.ceil(rows.length / columns);

  const gridVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT + GRID_GAP,
    overscan: 4,
  });

  if (viewMode === 'cards') {
    return (
      <div ref={parentRef} className="h-full overflow-auto p-3">
        <div
          role="listbox"
          aria-label="Bookmarks"
          aria-multiselectable="true"
          style={{ height: gridVirtualizer.getTotalSize(), position: 'relative' }}
        >
          {gridVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * columns;
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%',
                  height: CARD_HEIGHT, transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid', gap: GRID_GAP,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {rows.slice(start, start + columns).map((bookmark) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    selected={selectedIds.has(bookmark.id)}
                    onClick={(e) =>
                      clickBookmark(bookmark.id, orderedIds, {
                        shift: e.shiftKey,
                        meta: e.metaKey || e.ctrlKey,
                      })
                    }
                    onOpen={() => open(bookmark.url, bookmark.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
```

Place this branch after the loading and empty-state guards so those still apply, and
before the existing list return.

- [ ] **Step 4: Assemble `src/App.tsx`**

```tsx
import { useState } from 'react';
import { AppShell } from '@/app/AppShell';
import { BootGuard } from '@/app/BootGuard';
import { FolderTree } from '@/features/folders/FolderTree';
import { BookmarkList } from '@/features/library/BookmarkList';
import { DetailPane } from '@/features/library/DetailPane';
import { FilterBar } from '@/features/library/FilterBar';
import { ImportModal } from '@/features/import/ImportModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useBookmarks } from '@/features/library/useBookmarks';
import { useUiStore } from '@/stores/ui';

function Library({ onImport }: { onImport: () => void }) {
  const { rows } = useBookmarks();
  const selectedIds = useUiStore((s) => s.selectedIds);
  const selected = rows.find((r) => selectedIds.has(r.id)) ?? null;

  return (
    <AppShell
      sidebar={
        <div>
          <div className="flex items-center justify-between gap-2 border-b border-line p-3">
            <button onClick={onImport} className="rounded-[6px] bg-accent px-3 py-1.5 text-sm text-white">
              Import
            </button>
            <ThemeToggle />
          </div>
          <FolderTree />
        </div>
      }
      main={
        <div className="flex h-full flex-col">
          <FilterBar count={rows.length} />
          <div className="min-h-0 flex-1"><BookmarkList /></div>
        </div>
      }
      detail={<DetailPane bookmark={selected} />}
    />
  );
}

export default function App() {
  const [importing, setImporting] = useState(false);
  return (
    <BootGuard>
      {importing ? (
        <ImportModal onDone={() => setImporting(false)} />
      ) : (
        <Library onImport={() => setImporting(true)} />
      )}
    </BootGuard>
  );
}
```

- [ ] **Step 5: Run the full suite and commit**

Run: `pnpm test && pnpm build`
Expected: all tests pass, build succeeds.

```bash
git add -A
git commit -m "feat: add detail pane, filter bar, card view, and assemble app shell"
```

---

### Task 17: Filter controls

**Files:**
- Create: `src/features/library/FilterPanel.tsx`, `src/features/library/useFilterOptions.ts`
- Modify: `src/stores/ui.ts`, `src/features/library/useBookmarks.ts`, `src/features/library/FilterBar.tsx`
- Test: `src/stores/__tests__/ui.test.ts` (extend)

**Interfaces:**
- Consumes: `BookmarkFilter` (Task 8), `useUiStore`, `useBookmarks`
- Produces:
  ```ts
  // added to useUiStore
  filter: BookmarkFilter;
  setFilter(patch: Partial<BookmarkFilter>): void;
  clearFilters(): void;
  activeFilterCount(): number;

  // useFilterOptions.ts — distinct values for the dropdowns
  function useFilterOptions(): {
    sites: { value: string; count: number }[];
    tags: { value: string; count: number }[];
    browsers: string[];
    batches: { id: string; fileName: string }[];
  };
  ```

Spec §8.3 requires filters for folder, tag, site, source browser, import batch,
untagged, never-opened, and added-before-date. `BookmarkFilter` already implements and
tests all of them (Task 8); this task supplies the controls. Folder filtering is already
handled by the sidebar and is not duplicated here.

- [ ] **Step 1: Write the failing store test**

```ts
// append to src/stores/__tests__/ui.test.ts
describe('bookmark filters', () => {
  beforeEach(() => useUiStore.getState().resetForTest());

  it('starts with no filters active', () => {
    expect(useUiStore.getState().activeFilterCount()).toBe(0);
  });

  it('merges patches instead of replacing the whole filter', () => {
    useUiStore.getState().setFilter({ site: 'react.dev' });
    useUiStore.getState().setFilter({ untagged: true });
    expect(useUiStore.getState().filter).toMatchObject({ site: 'react.dev', untagged: true });
    expect(useUiStore.getState().activeFilterCount()).toBe(2);
  });

  it('clearing a single filter removes it from the count', () => {
    useUiStore.getState().setFilter({ site: 'react.dev' });
    useUiStore.getState().setFilter({ site: undefined });
    expect(useUiStore.getState().activeFilterCount()).toBe(0);
  });

  it('does not count a false boolean as an active filter', () => {
    useUiStore.getState().setFilter({ untagged: false });
    expect(useUiStore.getState().activeFilterCount()).toBe(0);
  });

  it('clearFilters resets everything', () => {
    useUiStore.getState().setFilter({ site: 'a.com', untagged: true, addedBefore: 100 });
    useUiStore.getState().clearFilters();
    expect(useUiStore.getState().activeFilterCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/stores/__tests__/ui.test.ts`
Expected: FAIL — `setFilter is not a function`.

- [ ] **Step 3: Add filter state to `src/stores/ui.ts`**

```ts
// Add the import:
import type { BookmarkFilter } from '@/db/repo/bookmarks';

// Add to UiState:
//   filter: BookmarkFilter;
//   setFilter: (patch: Partial<BookmarkFilter>) => void;
//   clearFilters: () => void;
//   activeFilterCount: () => number;
//
// Add to INITIAL: filter: {} as BookmarkFilter,
//
// Add to the store body:
      setFilter: (patch) =>
        set((s) => {
          const next: BookmarkFilter = { ...s.filter, ...patch };
          // An explicit undefined means "remove this filter", not "store undefined".
          for (const key of Object.keys(patch) as (keyof BookmarkFilter)[]) {
            if (patch[key] === undefined) delete next[key];
          }
          return { filter: next };
        }),
      clearFilters: () => set({ filter: {} }),
      activeFilterCount: () =>
        Object.values(get().filter).filter((v) => v !== undefined && v !== false && v !== '')
          .length,
```

Note: `activeFilterCount` reads state, so the store factory signature becomes
`(set, get) => ({ … })`. Filters are transient — exclude `filter` from `partialize`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/stores/__tests__/ui.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Write `src/features/library/useFilterOptions.ts`**

Distinct values are derived with SQL aggregates rather than by loading every row, so
this stays cheap at 20k bookmarks.

```ts
import { useEffect, useState } from 'react';
import { sql, isNull, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookmarks } from '@/db/schema';
import { listImportBatches } from '@/db/repo/importBatches';

type Options = {
  sites: { value: string; count: number }[];
  tags: { value: string; count: number }[];
  browsers: string[];
  batches: { id: string; fileName: string }[];
};

const EMPTY: Options = { sites: [], tags: [], browsers: [], batches: [] };

export function useFilterOptions(): Options {
  const [options, setOptions] = useState<Options>(EMPTY);

  useEffect(() => {
    void (async () => {
      const siteRows = await db
        .select({ value: bookmarks.site, count: sql<number>`count(*)` })
        .from(bookmarks)
        .where(and(isNull(bookmarks.deletedAt), sql`${bookmarks.site} <> ''`))
        .groupBy(bookmarks.site)
        .orderBy(sql`count(*) desc`)
        .limit(200);

      const browserRows = await db
        .select({ value: bookmarks.sourceBrowser })
        .from(bookmarks)
        .where(isNull(bookmarks.deletedAt))
        .groupBy(bookmarks.sourceBrowser);

      // Tags are a JSON array in a text column, so they are counted in JS.
      // Only the tags column is read, not whole rows.
      const tagRows = await db
        .select({ tags: bookmarks.tags })
        .from(bookmarks)
        .where(and(isNull(bookmarks.deletedAt), sql`${bookmarks.tags} <> '[]'`));

      const tagCounts = new Map<string, number>();
      for (const row of tagRows) {
        try {
          for (const tag of JSON.parse(row.tags) as string[]) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        } catch {
          // A corrupt tags value must not break the filter list.
        }
      }

      setOptions({
        sites: siteRows,
        tags: [...tagCounts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 200),
        browsers: browserRows.map((r) => r.value).filter((v): v is string => Boolean(v)),
        batches: (await listImportBatches(db)).map((b) => ({ id: b.id, fileName: b.fileName })),
      });
    })();
  }, []);

  return options;
}
```

- [ ] **Step 6: Write `src/features/library/FilterPanel.tsx`**

```tsx
import { useUiStore } from '@/stores/ui';
import { useFilterOptions } from './useFilterOptions';

function Select({
  label, value, onChange, children,
}: {
  label: string; value: string; onChange: (v: string | undefined) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        className="max-w-40 rounded-[4px] border border-line bg-bg px-1.5 py-1 text-text"
      >
        <option value="">Any</option>
        {children}
      </select>
    </label>
  );
}

export function FilterPanel() {
  const { filter, setFilter, clearFilters, activeFilterCount } = useUiStore();
  const { sites, tags, browsers, batches } = useFilterOptions();
  const active = activeFilterCount();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <Select label="Site" value={filter.site ?? ''} onChange={(v) => setFilter({ site: v })}>
        {sites.map((s) => (
          <option key={s.value} value={s.value}>{s.value} ({s.count})</option>
        ))}
      </Select>

      <Select label="Tag" value={filter.tag ?? ''} onChange={(v) => setFilter({ tag: v })}>
        {tags.map((t) => (
          <option key={t.value} value={t.value}>{t.value} ({t.count})</option>
        ))}
      </Select>

      <Select
        label="From"
        value={filter.sourceBrowser ?? ''}
        onChange={(v) => setFilter({ sourceBrowser: v as BookmarkFilter['sourceBrowser'] })}
      >
        {browsers.map((b) => <option key={b} value={b}>{b}</option>)}
      </Select>

      <Select
        label="Import"
        value={filter.importBatchId ?? ''}
        onChange={(v) => setFilter({ importBatchId: v })}
      >
        {batches.map((b) => <option key={b.id} value={b.id}>{b.fileName}</option>)}
      </Select>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        Added before
        <input
          type="date"
          value={
            filter.addedBefore
              ? new Date(filter.addedBefore * 1000).toISOString().slice(0, 10)
              : ''
          }
          onChange={(e) =>
            setFilter({
              addedBefore: e.target.value
                ? Math.floor(new Date(e.target.value).getTime() / 1000)
                : undefined,
            })
          }
          className="rounded-[4px] border border-line bg-bg px-1.5 py-1 text-text"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={filter.untagged ?? false}
          onChange={(e) => setFilter({ untagged: e.target.checked || undefined })}
        />
        Untagged
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={filter.neverOpened ?? false}
          onChange={(e) => setFilter({ neverOpened: e.target.checked || undefined })}
        />
        Never opened
      </label>

      {active > 0 && (
        <button
          onClick={clearFilters}
          className="ml-auto rounded-[4px] border border-line px-2 py-1 text-xs transition-colors duration-150 hover:border-accent"
        >
          Clear {active} {active === 1 ? 'filter' : 'filters'}
        </button>
      )}
    </div>
  );
}
```

Add `import type { BookmarkFilter } from '@/db/repo/bookmarks';` at the top of the file
for the `sourceBrowser` cast.

- [ ] **Step 7: Make `useBookmarks` read the store filter**

Replace the `extraFilter` parameter with the store's filter so every consumer stays in
sync, and remove the now-unused `NO_EXTRA_FILTER` constant.

```ts
// src/features/library/useBookmarks.ts — replace the filter assembly
  const storeFilter = useUiStore((s) => s.filter);

  const reload = useCallback(async () => {
    setLoading(true);
    const filter: BookmarkFilter = {
      ...storeFilter,
      ...(activeFolderId ? { folderId: activeFolderId } : {}),
    };
    setRows(await listBookmarks(db, filter, { key: sortKey, dir: sortDir }));
    setLoading(false);
  }, [activeFolderId, sortKey, sortDir, storeFilter]);
```

`storeFilter` is a stable reference between `setFilter` calls, so this does not loop.

- [ ] **Step 8: Render `FilterPanel` in `App.tsx`**

Place it directly under `FilterBar` inside the `main` column:

```tsx
        <div className="flex h-full flex-col">
          <FilterBar count={rows.length} />
          <FilterPanel />
          <div className="min-h-0 flex-1"><BookmarkList /></div>
        </div>
```

- [ ] **Step 9: Verify and commit**

Run `pnpm dev` with an import loaded. Verify each of the seven controls narrows the list,
that they combine (site + untagged together), that "Clear filters" resets them, and that
the count in `FilterBar` updates. Then:

```bash
pnpm test && pnpm build
git add -A
git commit -m "feat: add filter controls for site, tag, browser, batch, and date"
```

---

### Task 18: Performance pass, accessibility pass, and README

**Files:**
- Create: `scripts/generate-fixture.mjs`, `README.md`
- Modify: whatever the passes surface

**Interfaces:**
- Consumes: the whole application
- Produces: a verified-at-scale app and complete documentation

- [ ] **Step 1: Write `scripts/generate-fixture.mjs`**

```js
// Generates a 20,000-bookmark Netscape export for performance testing.
import { writeFileSync } from 'node:fs';

const SITES = ['react.dev', 'developer.mozilla.org', 'w3schools.com', 'github.com',
  'stackoverflow.com', 'news.ycombinator.com', 'arxiv.org', 'wikipedia.org'];
const TOTAL = Number(process.argv[2] ?? 20000);

let out = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<H1>Bookmarks</H1>\n<DL><p>\n`;
out += `  <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>\n  <DL><p>\n`;

for (let folder = 0; folder < 40; folder++) {
  out += `    <DT><H3 ADD_DATE="1700000000">Folder ${folder}</H3>\n    <DL><p>\n`;
  for (let i = 0; i < TOTAL / 40; i++) {
    const site = SITES[(folder + i) % SITES.length];
    out += `      <DT><A HREF="https://${site}/page/${folder}/${i}?utm_source=test" ADD_DATE="${1700000000 + i}">Item ${folder}-${i}</A>\n`;
  }
  out += `    </DL><p>\n`;
}
out += `  </DL><p>\n</DL><p>\n`;

writeFileSync('fixture-20k.html', out);
console.log(`wrote fixture-20k.html with ${TOTAL} bookmarks`);
```

- [ ] **Step 2: Run the performance pass**

```bash
node scripts/generate-fixture.mjs 20000
```

Import `fixture-20k.html` through the UI. Record and verify:

| Check | Requirement |
|---|---|
| UI stays interactive during parse | The progress bar animates; the page never freezes |
| Import completes | All 20,000 land, folder hierarchy intact |
| Scrolling | Smooth at both densities; DOM node count stays roughly constant while scrolling |
| Folder tree | Expands without visible lag |
| Hard refresh | All 20,000 still present |

If scrolling stutters, check that `BookmarkList` is not re-creating `orderedIds` per
render and that `useBookmarks` is not re-querying on every keystroke.

- [ ] **Step 3: Run the accessibility pass**

Verify by keyboard alone, in both themes:
- Tab reaches the folder tree, list, filter controls, and both pane dividers.
- Focus rings are visible everywhere (the `:focus-visible` rule from Task 1).
- The tree exposes `role="tree"` / `treeitem` with correct `aria-expanded`.
- The list exposes `role="listbox"` with `aria-multiselectable` and per-row `aria-selected`.
- Text contrast meets WCAG AA in light and dark — check `--color-muted` on `--color-bg`
  in both, since muted-on-background is the most likely failure.
- `prefers-reduced-motion` disables transitions.

- [ ] **Step 4: Write `README.md`**

It must document setup, export instructions, the data model, where data lives, backup,
the required headers, and — explicitly — the known limitations:

````markdown
# Bookmark Manager

A local-first bookmark manager. Your bookmarks are stored in SQLite inside your own
browser. There is no account, no server, and no network request.

## Setup

```bash
pnpm install
pnpm dev
```

`pnpm build` produces a static bundle in `dist/`. `pnpm serve:dist` serves it with the
required headers.

## Required HTTP headers

This app stores data in SQLite via the Origin Private File System, which browsers only
allow on cross-origin isolated pages. Your server **must** send:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Without them the app will detect the problem at startup and refuse to run rather than
silently discard your bookmarks. `pnpm dev` and `pnpm serve:dist` set these for you.
Static hosts that cannot set response headers (such as GitHub Pages) will not work.

## Getting your bookmarks out of your browser

A web page cannot read your browser's bookmarks — no browser exposes that to websites.
Export them to a file first:

| Browser | How |
|---|---|
| Chrome | `chrome://bookmarks` → ⋮ → Export bookmarks |
| Brave | `brave://bookmarks` → ⋮ → Export bookmarks |
| Edge | `edge://favorites` → ⋯ → Export favorites |
| Firefox | `Ctrl+Shift+O` → Import and Backup → Export Bookmarks to HTML |
| Safari | File → Export → Bookmarks |

Then drop the file into the app, click to pick it, or paste the HTML with `Ctrl+V`.

## Where your data lives

In your browser's Origin Private File System, in a SQLite database named
`bookmarks.sqlite3`, scoped to this origin. It is not synced anywhere. Clearing your
browser's site data for this origin deletes it.

## Backup

Full database export and restore ships in Milestone 2. Until then, re-export from your
browser to keep a copy.

## Data model

Four tables — `folders`, `bookmarks`, `import_batches`, `settings` — defined in
`src/db/schema.ts`. Bookmarks store both the original `url` (never modified) and a
`normalized_url` used only for duplicate comparison.

## Known limitations

- **No direct browser bookmark access.** Import is via exported HTML. This is a browser
  security boundary, not an oversight.
- **Cross-origin isolation is required.** See the header section above.
- **Milestone 1 scope.** Drag and drop, duplicate detection, search, trash, export, link
  previews, and the AI features are not in this milestone.

## Development

```bash
pnpm test          # unit tests
pnpm lint
node scripts/generate-fixture.mjs 20000   # 20k-bookmark perf fixture
```
````

- [ ] **Step 5: Final verification**

```bash
pnpm install && pnpm test && pnpm build
```
Expected: clean install, all tests pass, build succeeds.

Then confirm every Definition of Done item in spec §10, including disconnecting the
network and reloading — nothing in Milestone 1 should break.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: add README and performance fixture generator"
```

---

## Spec Coverage

| Spec section | Task |
|---|---|
| §2 constraints | Global Constraints; enforced throughout |
| §3.1 SQLocal wiring, transactions | Task 6 |
| §3.2 cross-origin isolation, boot guard | Tasks 1, 6 |
| §4 architecture and boundaries | File Structure; Tasks 4–12 |
| §5 data model, indexes | Task 5 |
| §5.1 migrations | Task 6 |
| §5.2 boot sequence | Tasks 6, 7 |
| §6 URL normalization | Task 4 |
| §7.1–7.2 reality check, browser detection | Task 9 |
| §7.3 three input paths | Task 13 |
| §7.4 parser | Task 10 |
| §7.5 folder mapping | Task 11 |
| §7.6 import preview | Tasks 11, 13 |
| §7.7 batched apply | Task 12 |
| §8.1 layout | Task 3 |
| §8.2 folder tree | Task 14 |
| §8.3 virtualized list, selection, sort, views | Tasks 15, 16 |
| §8.4 detail pane tier 1, open behavior | Tasks 15, 16 |
| §8.3 filter controls | Tasks 8 (query layer), 17 (UI) |
| §8.5 visual direction, themes, density | Tasks 1, 2, 16 |
| §9 testing strategy | Tasks 4–12, 15, 17 |
| §10 definition of done | Task 18 |

Every spec section maps to at least one task. The filter controls of §8.3 were originally
folded into Task 16 as query-layer-only; they are now Task 17 so the UI matches the spec.

