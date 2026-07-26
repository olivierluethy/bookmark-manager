# Local-First Bookmark Manager — Milestone 1 Design

**Date:** 2026-07-26
**Status:** Approved
**Scope:** Phases 1–4 of the product brief (scaffold, data layer, import, core UI)

---

## 1. Goal

A local-first bookmark manager for power users with thousands of bookmarks. Milestone 1
delivers the load-bearing half: a user can dump multiple browser bookmark exports in,
watch them import without freezing, and browse the result in a fast, virtualized,
well-designed three-pane UI.

Milestone 1 is done when a real 5,000+ entry Chrome export imports with its folder
hierarchy intact, survives a hard refresh, and browses smoothly.

### Job to be done

> "I have a huge, messy pile of browser bookmarks. Let me dump them all in, immediately
> see what's redundant, and organize the rest fast."

Milestone 1 covers *dump them all in* and the foundation for *organize fast*. Seeing
what's redundant is Milestone 2, but the data written in Milestone 1 is shaped so that
detection is an index lookup rather than a rescan.

---

## 2. Non-negotiable constraints

| Constraint | Requirement |
|---|---|
| No login | No auth, accounts, sign-up, or session cookies. Ever. |
| Offline-first | Every Milestone 1 feature works with the network cable unplugged. There are no network-dependent features in this milestone at all. |
| Local data only | All bookmark data stays in the browser. Nothing leaves the device. |
| Package manager | `pnpm` only. Commit `pnpm-lock.yaml`. Never generate `package-lock.json` or `yarn.lock`. |
| Styling | Tailwind CSS v4 only. No CSS-in-JS. Headless primitives are acceptable; themed component libraries are not. |
| Themes | Light and dark, both fully designed. Three-state toggle (`light` / `dark` / `system`), persisted, defaulting to `system`. |
| Scale | Responsive at 20,000 bookmarks. Virtualized lists. No O(n²) work on the main thread. |
| TypeScript | Strict mode. No `any` without an inline justification comment. |
| Commits | Conventional Commits for every commit. |

---

## 3. Verified technology stack

Versions confirmed against the npm registry on 2026-07-26.

| Package | Version | Role |
|---|---|---|
| `react` | 19.2.8 | UI |
| `vite` | 8.1.5 | Build |
| `typescript` | latest 5.x | Types, strict mode |
| `tailwindcss` + `@tailwindcss/vite` | 4.3.3 | Styling |
| `drizzle-orm` | 0.45.2 | Data layer |
| `drizzle-kit` | 0.31.10 | Migration generation |
| `sqlocal` | 0.18.0 | SQLite in a Worker over OPFS + Drizzle driver |
| `@tanstack/react-virtual` | 3.14.8 | List virtualization |
| `zustand` | 5.0.14 | UI state only |
| `tldts` | 7.4.9 | eTLD+1 extraction |
| `vitest` | 4.1.10 | Tests |
| `better-sqlite3` | latest | Node-side repository tests (dev only) |
| `@fontsource/*` | latest | Self-hosted fonts |

Deferred to Milestone 2, not installed now: `@dnd-kit/core`, `@dnd-kit/sortable`,
`minisearch`, `vite-plugin-pwa`, `ai`, `@ai-sdk/*`.

### 3.1 Why SQLocal + Drizzle

The brief requires Drizzle ORM, no login, and full offline operation. A conventional
Drizzle setup implies a Node server and a network hop, which contradicts offline +
no-login. SQLocal runs real SQLite in a Web Worker backed by the Origin Private File
System and exposes a Drizzle driver, giving genuine Drizzle schemas, migrations, and SQL
with zero server and full offline capability.

Verified wiring (from sqlocal.dev/drizzle/setup):

```ts
import { SQLocalDrizzle } from 'sqlocal/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

// Keep the instance. `transaction` is a method on it and must not be
// destructured away from its receiver.
export const sqlocal = new SQLocalDrizzle({
  databasePath: 'bookmarks.sqlite3',
  verbose: false,
});
export const db = drizzle(sqlocal.driver, sqlocal.batchDriver, { schema });
```

**Transactions:** use `sqlocal.transaction()`, not Drizzle's. The SQLocal docs state
explicitly that Drizzle's `transaction()` cannot isolate transactions from outside
queries. This applies to migrations and to batched import inserts.

The exact constructor options object, the presence of a third `{ schema }` argument, and
the `transaction()` signature are to be confirmed against the installed package's types
as the first task of the data-layer phase, before anything is built on top.

### 3.2 Cross-origin isolation — a hard requirement

SQLocal's OPFS persistence relies on APIs gated behind cross-origin isolation. The page
must be served with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Without them the browser blocks OPFS access and **no data persists across a refresh**.

- `sqlocal/vite` sets these for the dev server automatically and handles Worker
  compilation. It does **not** configure production.
- `credentialless` is chosen over `require-corp` because `require-corp` blocks
  cross-origin images (favicons) and cross-origin iframes unless the remote host sends
  CORP headers, which almost none do. That would foreclose the Milestone 2 preview
  feature. `credentialless` keeps isolation while allowing those loads with credentials
  stripped.
- Safari's support for `credentialless` is **unverified**. This is handled by the runtime
  guard below rather than by assumption, and will be checked empirically as the first
  task of the data-layer phase.

**Runtime guard (required):** at boot, check `crossOriginIsolated`, OPFS availability,
and Worker availability. If any is missing, render a blocking screen that states plainly
what is wrong and how to fix it. Never fail silently, and never let the app appear to
work while discarding writes.

**Hosting decision:** local / self-hosted only. Ship the `sqlocal/vite` plugin config for
`pnpm dev`, plus a small static preview server that sets both headers for `pnpm preview`.
Document the required headers in the README for any other server.

---

## 4. Architecture

The design principle: three pure, dependency-free cores with thin shells around them.
Every hard piece of logic is a pure function that can be unit-tested in Node without a
browser, a worker, or a database.

```
src/
  app/
    App.tsx                 Shell, view switching, providers
    BootGuard.tsx           Cross-origin isolation / OPFS / Worker checks
  db/
    schema.ts               Drizzle schema (§5)
    client.ts               SQLocalDrizzle wiring, singleton
    migrate.ts              Migration runner + bookkeeping
    seed.ts                 System folder seeding
    migrations/             drizzle-kit output, imported ?raw
    repo/
      folders.ts            Typed repository functions
      bookmarks.ts
      settings.ts
      importBatches.ts
  features/
    import/
      parseNetscape.ts      PURE: string -> ParsedFile
      browserDetect.ts      PURE: navigator info -> BrowserId
      planImport.ts         PURE: (ParsedFile[], ExistingTree, Options) -> ImportPlan
      applyImport.ts        Executes an ImportPlan against the DB
      ImportModal.tsx  ImportPreview.tsx  DropZone.tsx  ExportInstructions.tsx
      __fixtures__/         chrome.html, firefox.html, malformed.html
    library/
      BookmarkList.tsx      Virtualized
      BookmarkRow.tsx  BookmarkCard.tsx  DetailPane.tsx  FilterBar.tsx  SortMenu.tsx
    folders/
      FolderTree.tsx  FolderNode.tsx
  workers/
    importWorker.ts         Thin transport shell around parseNetscape
  lib/
    url.ts                  PURE: normalizeUrl, urlHash, siteOf
    theme.ts                Three-state theme resolution
    panes.ts                Pane layout persistence
  stores/
    ui.ts                   zustand: selection, filters, sort, view, panes, density
```

### Boundaries

- **UI never imports Drizzle.** Only `db/repo/*` touches the database.
- **Repository functions take a `db` instance as a parameter**, not a module singleton.
  This is what makes Node-side testing possible (§9).
- **The parser is not coupled to the worker.** `importWorker.ts` receives file text, calls
  `parseNetscape`, and posts progress. All parsing logic is tested directly.
- **The plan is data, not behavior.** `planImport` returns a serializable `ImportPlan`.
  The preview screen renders that object; `applyImport` executes the same object. What
  the user sees is provably what gets written.

---

## 5. Data model

`src/db/schema.ts`. Text UUID primary keys, integer unix timestamps (seconds).

```
folders
  id            text pk
  parentId      text null -> folders.id (self-reference, cascade delete)
  name          text
  icon          text null           -- emoji or lucide icon name
  color         text null
  sortOrder     integer
  isSystem      integer(bool)
  systemKey     text null           -- 'unsorted' | 'pinned' | 'trash'
  createdAt / updatedAt integer

bookmarks
  id            text pk
  folderId      text null -> folders.id (set null on delete -> falls to Unsorted)
  url           text                -- original URL, verbatim, never mutated
  normalizedUrl text                -- §6, indexed
  urlHash       text                -- sha-256 of normalizedUrl, indexed
  site          text                -- eTLD+1 via tldts, indexed
  title         text
  description   text null
  faviconUrl    text null
  previewImage  text null
  tags          text                -- JSON array of strings
  notes         text null
  isPinned      integer(bool)
  addedAt       integer             -- from the import file when available
  lastOpenedAt  integer null
  openCount     integer default 0
  deletedAt     integer null        -- soft delete
  sourceBrowser text null           -- 'chrome'|'firefox'|'brave'|'edge'|'safari'|'unknown'
  importBatchId text null -> importBatches.id
  sortOrder     integer
  createdAt / updatedAt integer

importBatches
  id            text pk
  fileName      text
  detectedBrowser text
  totalParsed   integer
  imported      integer
  skippedDuplicates integer
  importedAt    integer

settings
  key           text pk
  value         text                -- JSON
```

**Required indexes:** `bookmarks.urlHash`, `bookmarks.site`, `bookmarks.folderId`,
`bookmarks.deletedAt`, `folders.parentId`.

**System folders** are seeded on first boot, idempotently by `systemKey`, and cannot be
renamed or deleted: `Unsorted`, `Pinned`, `Trash`.

Milestone 1 writes several columns it does not yet read (`deletedAt`, `isPinned`,
`previewImage`, `lastOpenedAt`, `openCount`). This is intentional — the schema is
complete now so Milestone 2 needs no migration to light those features up.

### 5.1 Migrations

`drizzle-kit generate` produces SQL files in `src/db/migrations/`. They are imported as
raw strings (`?raw`) and applied at boot inside SQLocal's `transaction()`. A `migrations`
bookkeeping table records `(id, hash, appliedAt)`; only unapplied files run, in filename
order. A hash mismatch on an already-applied migration is a hard error with a clear
message, not a silent skip.

### 5.2 Boot sequence

1. Runtime guard: `crossOriginIsolated`, OPFS, Worker. Blocking screen on failure.
2. Open the database.
3. Run pending migrations.
4. Seed system folders (idempotent).
5. Load settings (theme, panes, density, view mode).

Trash purging is deferred to Milestone 2 along with the rest of the retention feature.

---

## 6. URL normalization

Implemented in `lib/url.ts` as pure functions. Used at write time so that Milestone 2's
duplicate detection is an index lookup.

`normalizeUrl(url)`:

- Lowercase scheme and host.
- Strip a leading `www.`.
- Unify `http` → `https` **for comparison purposes only**.
- Remove the trailing slash.
- Remove the fragment (`#…`) **unless** the path is empty and the fragment looks like a
  SPA route (`#/…`).
- Strip tracking parameters: `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `ref`,
  `ref_src`, `igshid`, `si`, `spm`, `_ga`, `yclid`, `msclkid`.
- Sort remaining query parameters alphabetically.

**The stored original `url` is never mutated.** The detail pane surfaces the difference
between `url` and `normalizedUrl` as a visible diff, so normalization is inspectable
rather than magic.

`urlHash(normalized)` uses WebCrypto `crypto.subtle.digest('SHA-256')`. It is async, and
is computed in batch during import rather than per-row.

`siteOf(url)` uses `tldts` to extract eTLD+1 correctly, so `w3schools.com/html/x.asp` and
`w3schools.com/js/y.asp` share a `site` while `github.io` subdomains do not incorrectly
collapse.

---

## 7. Import

### 7.1 Reality check

**A web page cannot read the browser's bookmark store.** No such API exists outside an
installed extension. The app must not attempt it, fake it, or imply it works. Import is
via the user's exported bookmark HTML file, and the export step is made frictionless.

### 7.2 Browser detection and instructions

`browserDetect.ts` is pure and takes navigator information as an argument. Detection
order: `navigator.brave?.isBrave()` first, then User-Agent Client Hints, then a UA-string
fallback. Distinguishes Chrome, Brave, Edge, Firefox, Safari, Arc, Opera, unknown.

The instructions card shows the exact steps for the detected browser, with a manual
override for when detection is wrong:

- Chrome: `chrome://bookmarks` → ⋮ → Export bookmarks
- Brave: `brave://bookmarks` → ⋮ → Export bookmarks
- Edge: `edge://favorites` → ⋮ → Export favorites
- Firefox: `Ctrl+Shift+O` → Import and Backup → Export Bookmarks to HTML
- Safari: File → Export → Bookmarks

Internal URLs render as a **copy-to-clipboard button, never a link**. Browsers block
navigation to `chrome://` from a page, so a link would be visibly broken.

### 7.3 Input paths

All three are required:

1. Drag and drop files onto a full-window drop zone.
2. Click to open the OS file picker.
3. Paste (`Ctrl+V`) raw HTML into the import modal.

Multiple `.html` / `.htm` files are accepted in one operation and produce one combined
result summary.

### 7.4 Parser

`parseNetscape.ts` implements the Netscape Bookmark File Format using `DOMParser`, never
regex. It runs inside `workers/importWorker.ts` so a 20k-entry file never blocks the UI.

It must handle:

- Nested `<DL><DT><H3>` folder trees of arbitrary depth, preserved as hierarchy.
- `ADD_DATE`, `LAST_MODIFIED`, `ICON` (base64 data URI), `TAGS`, `SHORTCUTURL`.
- Firefox specifics: `PERSONAL_TOOLBAR_FOLDER`, `<DD>` description nodes, `place:`
  pseudo-URLs (skipped), `<HR>` separators (skipped).
- Malformed and unclosed tags.

**The parser never throws.** Every problem is collected into a per-file error list that
the preview screen displays. A single bad entry must not lose the other 19,999.

### 7.5 Folder mapping

Decision: **match by path, drop export roots.**

- Synthetic browser roots are stripped: `Bookmarks bar`, `Bookmarks Bar`,
  `Other bookmarks`, `Bookmarks Menu`, `Bookmarks Toolbar`, and any folder marked
  `PERSONAL_TOOLBAR_FOLDER`. Bookmarks sitting directly in a stripped root go to
  `Unsorted`.
- Remaining folders merge into the existing tree by **case-insensitive full path**, so
  re-importing an updated export from the same browser is idempotent rather than
  producing a second parallel tree.
- A "keep browser export roots" checkbox is offered for users who want the mirror.

The preview reports how many folders merged versus were created.

### 7.6 Import preview (mandatory before any write)

`planImport` produces an `ImportPlan` containing:

- Count of new bookmarks.
- Count of exact duplicates against existing data (matched on `urlHash`).
- Count of duplicates within the imported files themselves.
- Count of skipped entries (`place:` URLs, separators, entries with no href).
- Folder merge summary: merged paths versus new paths.
- Per-file parse error list.

The user chooses a placement mode — merge into the existing tree (default), import under
a new folder named after the file, or flatten into `Unsorted` — and whether to skip exact
duplicates (default on). Nothing is written until Apply is pressed.

### 7.7 Apply

Inserts run in batched transactions of 500 via SQLocal's `transaction()`. A real
percentage is reported for both the parse and the insert phase. An `importBatches` row
records the outcome, which lets Milestone 2 filter by import batch.

---

## 8. Core UI

### 8.1 Layout

Left sidebar (folder tree) · main list/grid · right detail pane. All three resizable,
each collapsible, layout persisted to `settings`. Responsive down to tablet width, where
the sidebar becomes a drawer.

### 8.2 Folder tree

Unlimited nesting. Create, rename, recolor, set emoji/icon, and delete with an explicit
choice between moving children up or sending contents to Trash. Expand/collapse state
persisted. Live bookmark counts with a user toggle for including or excluding
subfolders. Correct ARIA tree semantics and full keyboard navigation.

### 8.3 List

Virtualized with `@tanstack/react-virtual`. Three view modes: list, compact list, and
card grid with favicon and preview image slot. Sort by title, date added, date last
opened, open count, site, or manual `sortOrder`.

Filters: folder, tag, site, source browser, import batch, untagged, never-opened, and
added-before-date.

Selection lives in `stores/ui.ts` as an anchor plus a set, supporting shift-range and
ctrl/cmd-toggle. This model is deliberately shaped for Milestone 2's multi-select drag,
so no rework is needed there.

### 8.4 Detail pane — tier 1 only

Milestone 1 ships only the always-available offline tier from the brief's §8.1:

- Title, full URL, and the visible normalization diff.
- Favicon sourced from the imported `ICON` data URI when present.
- Tags, notes, folder path, date added, source browser, open count.
- A list of other bookmarks on the same site.

Explicitly **not** in Milestone 1: the sandboxed iframe preview and metadata/`og:image`
enrichment. Both are network-dependent and belong to phase 9.

**Open behavior:** single click selects. `Enter` or double-click opens in a new tab with
`rel="noopener noreferrer"`. Every open increments `openCount` and sets `lastOpenedAt`.

### 8.5 Visual direction

Editorial / warm paper — deliberately not default-Tailwind-blue and not a generic admin
dashboard.

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#FBF9F5` | `#17150F` |
| `--color-surface` | `#FFFFFF` | `#201D16` |
| `--color-text` | `#1F1B14` | `#EFE9DC` |
| `--color-muted` | `#6B6355` | `#9A9081` |
| `--color-line` | `#E5DED1` | `#332E24` |
| `--color-accent` | `#B4552E` | `#B4552E` |

- Type: a serif display face for headings, Inter for UI, tabular numerals for counts.
  **Self-hosted via `@fontsource`** — a Google Fonts CDN link would break the offline
  guarantee.
- 8px spacing grid, 6px radii.
- Motion 120–200 ms, purposeful, respecting `prefers-reduced-motion`.
- Both themes hand-tuned to WCAG AA minimum. Neither is an afterthought.
- Density toggle (comfortable / compact), persisted.
- Visible focus rings throughout.
- Every async surface gets a real skeleton state; every list gets a designed empty state
  that says what to do next.

---

## 9. Testing

Vitest. The pure-core architecture is what makes this tractable.

**Pure unit tests (Node, no browser):**

- `normalizeUrl` — each tracking parameter, fragment rules including the SPA-route
  exception, trailing slash, scheme unification, parameter sorting.
- `siteOf` — eTLD+1 correctness including multi-part public suffixes.
- `parseNetscape` — against the Chrome, Firefox, and malformed fixtures. Asserts nesting
  depth, `ADD_DATE` parsing, `ICON` data URIs, `place:` skipping, `<HR>` separators,
  `<DD>` descriptions, `PERSONAL_TOOLBAR_FOLDER` handling, and that malformed input
  yields errors rather than an exception.
- `planImport` — root stripping, case-insensitive path merging, idempotency of importing
  the same file twice, duplicate classification, all three placement modes.
- `browserDetect` — each supported browser's signals, including Brave being detected as
  Brave and not Chrome.

**Repository tests (Node, real SQL):** OPFS does not exist in Node, so repository
functions accept a `db` parameter and tests run the *same schema and migrations* against
`better-sqlite3` with Drizzle's better-sqlite3 driver. The SQL and the schema are
genuinely verified; only the storage backend differs from production. This is a
deliberate, documented tradeoff — it does not exercise the SQLocal proxy layer, which is
covered instead by the manual boot check in §10.

**Performance:** a generated 20,000-bookmark fixture used to verify list interaction
stays responsive and import does not block the UI.

---

## 10. Definition of done for Milestone 1

- `pnpm install && pnpm dev` works from a clean clone.
- `pnpm build` produces a deployable static bundle; `pnpm preview` serves it with the
  correct COOP/COEP headers.
- `pnpm test` passes.
- A real 5,000+ entry Chrome export imports without freezing the UI and preserves the
  folder hierarchy.
- Importing the same export a second time creates no duplicate folder tree.
- A hard refresh restores all data, folder expand/collapse state, theme, density, and
  pane layout.
- Disconnecting the network breaks nothing whatsoever in this milestone.
- Both themes are visually complete, with no unstyled or contrast-failing surfaces.
- On a browser without cross-origin isolation or OPFS, the app shows a clear blocking
  explanation rather than silently discarding data.
- `README.md` documents setup, the export-your-bookmarks instructions, the data model,
  where data is stored, how to back it up, the required COOP/COEP headers, and the known
  limitations.

---

## 11. Explicitly out of scope for Milestone 1

Deferred to Milestone 2, which gets its own design cycle:

Drag and drop (all cases), the undo stack, duplicate and similarity detection, the
cleanup view, MiniSearch search and the command palette, trash and 30-day retention,
export and sharing, iframe preview and metadata enrichment, link-health checking, the
Rediscover panel, the AI layer, and the PWA offline shell.

Milestone 1 is built with these seams in place: the selection model is drag-ready, URL
normalization and hashing are already computed at write time, and the schema already
carries the columns those features need.

---

## 12. Corrections to the original brief

Confirmed and carried into this design:

1. A web app **cannot** read browser bookmarks directly. Import is via exported HTML,
   with the export flow made as frictionless as possible.
2. **"Rhino algorithm"** is not a real thing — this is MiniSearch-based fuzzy full-text
   search (Milestone 2).
3. **"Universal API SDK"** is the **Vercel AI SDK** (`ai` v7, confirmed published as
   7.0.37).
4. Drizzle ORM runs **client-side over OPFS SQLite via SQLocal**, because a conventional
   Drizzle-on-a-server setup would contradict the offline and no-login requirements.
5. In-app iframe previews **will fail for most large sites**; the layered fallback is the
   answer (Milestone 2).
6. Metadata enrichment and link-health checks are **network-dependent and opt-in**, never
   automatic (Milestone 2).

Added during design, not present in the original brief:

7. **SQLocal requires cross-origin isolation.** Production hosting must send
   `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy:
   credentialless`, or OPFS is blocked and no data persists. This is handled by the
   `sqlocal/vite` plugin in development, a header-setting preview server in production,
   and a runtime guard that fails loudly rather than silently.
8. **Transactions come from SQLocal, not Drizzle.** Drizzle's `transaction()` cannot
   isolate from outside queries on this driver.
