<div align="center">

# 🔖 Bookmark

**A local-first bookmark manager for people with thousands of messy browser bookmarks.**

Real SQLite, running entirely inside your own browser. No account, no server, no network request.
Close the laptop lid, pull the ethernet cable — it still works.

</div>

---

Built because Raindrop.io wants a login and a subscription for something that is, fundamentally,
a list of URLs on your own machine. Your bookmarks live in **your** browser's storage and never
leave it.

## Highlights

- **📥 Import from any browser** — drag-and-drop, click-to-pick, or `Ctrl+V` paste. Chrome, Brave,
  Edge, Firefox, Safari, Arc, Opera. Multiple files at once. Parsed off the main thread so a
  20,000-bookmark export never freezes the tab.
- **🗂️ Folder tree** — your exported hierarchy, preserved. Live counts with an
  include-subfolders toggle, and expansion that survives a reload.
- **⚡ Virtualized list** — smooth at 20k rows. List, compact, and card views, with
  anchor / shift / ctrl multi-selection.
- **🔍 Filters & sort** — by site, tag, source browser, import batch, date added, untagged, or
  never-opened. Sort by date, title, last opened, times opened, or site.
- **🧐 Offline detail pane** — see how a URL is normalized for duplicate detection, its folder
  path, and every other bookmark you have on the same site.
- **🎨 Editorial theme** — a warm-paper light mode and a proper dark mode, following your OS by
  default. Self-hosted fonts, no CDN.
- **🔁 Idempotent re-import** — re-importing a later export updates rather than duplicating.
  Folders match by path; duplicate URLs are detected by a normalized hash.

## Quick start

```bash
pnpm install
pnpm dev
```

Open the URL it prints. That's it.

```bash
pnpm build          # static bundle into dist/
pnpm serve:dist     # serve that bundle locally, with the required headers
pnpm test           # unit tests
pnpm lint
```

> [!IMPORTANT]
> **You cannot serve this with any old static server.**
>
> The app stores data in SQLite via the Origin Private File System (OPFS), which browsers only
> permit on a **cross-origin isolated** page. Your server must send:
>
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: credentialless
> ```
>
> `pnpm dev` and `pnpm serve:dist` both do this for you. If you serve `dist/` some other way
> (`python -m http.server`, GitHub Pages, most static hosts), the app detects it at startup and
> shows an explanatory screen instead of running. That is deliberate — it refuses rather than
> appearing to work while silently discarding everything you import.

## Getting your bookmarks out of your browser

A web page **cannot** read your browser's bookmarks — no browser exposes that to websites, only an
installed extension can. So the flow is: export to a file, then drop the file in. The app detects
your browser and shows the exact steps, but for reference:

| Browser | How to export |
|---|---|
| Chrome  | `chrome://bookmarks` → ⋮ → Export bookmarks |
| Brave   | `brave://bookmarks` → ⋮ → Export bookmarks |
| Edge    | `edge://favorites` → ⋯ → Export favorites |
| Firefox | `Ctrl+Shift+O` → Import and Backup → Export Bookmarks to HTML |
| Safari  | File → Export → Bookmarks |

Those `chrome://`-style URLs can't be linked from a web page, which is why the app gives you a copy
button instead of a link.

Then hit **Import** and drag the file onto the window, click to pick it, or paste the HTML with
`Ctrl+V`. **Nothing is written until you press Import** — the preview shows exactly what will
happen: how many are new, how many you already have, how many are duplicated inside the files
themselves, how many were skipped, and which folders merge into your existing tree versus get
created.

## Where your data lives, and how not to lose it

In your browser's **Origin Private File System**, in a SQLite database called `bookmarks.sqlite3`,
scoped to the origin you're serving from.

- It is **not synced** anywhere. It exists on this machine, in this browser.
- **Clearing site data for this origin deletes it** — so does "clear browsing data" with site data
  included.
- A different port or hostname is a **different origin**, and therefore a different, empty database.
  `localhost:5173` and `localhost:4173` do not share bookmarks.
- Private/incognito windows get their own throwaway storage.

**Backup:** full database export/restore is a later milestone. Until then, keep the original `.html`
export from your browser — re-importing reconstructs everything, and the importer is idempotent so
it won't duplicate.

## How it's put together

```
src/
  app/           AppShell, BootGuard
  components/    ThemeToggle, ResizablePanes
  db/            schema, SQLocal/OPFS client, migrations, repositories, seeding
  features/
    import/      parser, planner, worker client, import UI
    folders/     folder tree + counts
    library/     virtualized list, cards, selection, filters, detail pane
  workers/       importWorker.ts — parses files off the main thread
  lib/           url.ts (normalization/hashing), theme.ts, sort.ts
  stores/        zustand — UI state only, never bookmark data
```

The design principle is **pure cores with thin shells**. The pieces that carry real complexity —
`parseNetscape`, `planImport`, the selection model, and `lib/url` — are pure functions with no
database or DOM dependency, so they're fully tested in Node without a browser. The Web Worker is
just transport around the parser; the UI renders the plan object that the writer executes.

### Data model

Four tables in `src/db/schema.ts`:

- **`bookmarks`** — stores both the original `url` (never modified) and a `normalized_url` used only
  for duplicate comparison, plus its SHA-256 as an indexed `url_hash`.
- **`folders`** — a self-referencing tree with unlimited nesting, plus three system folders
  (Unsorted / Pinned / Trash) that can't be renamed or deleted.
- **`import_batches`** — one row per import, so you can filter by "what did that file bring in".
- **`settings`** — key/value JSON.

**Tech:** React 19, Vite, TypeScript (strict), Tailwind v4, Drizzle ORM, SQLocal (SQLite in a Worker
over OPFS), `@tanstack/react-virtual`, zustand, tldts, linkedom, Vitest.

## Known limitations — read before filing a bug

These are real constraints, not oversights:

1. **No direct browser bookmark access.** Export-then-import is the only route a web page has. It's a
   browser security boundary.
2. **Cross-origin isolation is mandatory** (see above). This rules out hosts that can't set response
   headers, GitHub Pages among them.
3. **Later features are out of scope for now** — drag & drop reordering, a cleanup / duplicate view,
   full-text search + command palette, trash retention, database export, in-app link previews, and
   the AI layer are planned for a later milestone. The groundwork is already in place: the selection
   model is drag-ready, `normalizedUrl` / `urlHash` are computed at write time so dedup is an index
   lookup, and the schema already carries `deletedAt` / `isPinned` / `previewImage` / `lastOpenedAt`.

## License

ISC
