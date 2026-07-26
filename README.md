# Bookmark Manager

A local-first bookmark manager for people with thousands of messy browser bookmarks.

Everything lives in **your own browser** — real SQLite, stored in the Origin Private File
System. There is no account, no server, and no network request. Close the laptop lid, pull
the ethernet cable, it still works.

Built because Raindrop.io wants a login and a subscription for something that is,
fundamentally, a list of URLs on your own machine.

---

## Start it up

```bash
pnpm install
pnpm dev
```

Open the URL it prints. That's it.

```bash
pnpm build         # static bundle into dist/
pnpm serve:dist    # serve that bundle locally, with the required headers
pnpm test          # 132 tests
pnpm lint
```

> **⚠️ You cannot serve this with any old static server.**
>
> The app stores data in SQLite via OPFS, which browsers only permit on a
> **cross-origin isolated** page. Your server must send:
>
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: credentialless
> ```
>
> `pnpm dev` and `pnpm serve:dist` both do this for you. If you serve `dist/` some other
> way (`python -m http.server`, GitHub Pages, most static hosts), the app will detect it
> at startup and show an explanatory screen instead of running. That is deliberate — it
> refuses rather than appearing to work while silently throwing away everything you
> import.

---

## Getting your bookmarks out of your browser

**A web page cannot read your browser's bookmarks.** No browser exposes that to websites —
only an installed extension can. So the flow is: export to a file, then drop the file in.
The app detects your browser and shows the right steps, but for reference:

| Browser | How to export |
|---|---|
| Chrome  | `chrome://bookmarks` → ⋮ → Export bookmarks |
| Brave   | `brave://bookmarks` → ⋮ → Export bookmarks |
| Edge    | `edge://favorites` → ⋯ → Export favorites |
| Firefox | `Ctrl+Shift+O` → Import and Backup → Export Bookmarks to HTML |
| Safari  | File → Export → Bookmarks |

Those `chrome://` style URLs can't be linked to from a web page, which is why the app
gives you a copy button instead of a link.

Then in the app hit **Import** and either drag the file onto the window, click to pick it,
or paste the HTML with `Ctrl+V`. Multiple files at once is fine.

**Nothing is written until you press Apply.** The preview screen shows exactly what will
happen: how many are new, how many you already have, how many are duplicated inside the
files themselves, how many were skipped, and which folders will merge into your existing
tree versus be created.

Re-importing the same export later is safe — folders match by path, so you get updates
rather than a second parallel copy of everything.

---

## What works right now

**13 of 18 tasks done.** See [`STATUS.md`](STATUS.md) for the full checklist.

✅ **Import works end to end.** Real Chrome/Firefox/Brave/Edge/Safari exports, parsed off
the main thread, folder hierarchy preserved, duplicates detected, data persists across
reloads. Verified in a real browser against real exports.

✅ Light and dark themes, both properly designed, following your OS by default.

✅ The whole data layer: schema, migrations, repositories, seeding, transactions.

🚧 **The three panes are still placeholders.** You can import and the bookmarks are
genuinely in the database — but the sidebar, list, and detail views aren't built yet
(tasks 14–16). So today it's "import and trust", not "import and browse".

Remaining: folder tree, virtualized list + selection, detail pane, filter controls, and a
performance/accessibility pass.

---

## Where your data lives, and how to not lose it

In your browser's **Origin Private File System**, in a SQLite database called
`bookmarks.sqlite3`, scoped to the origin you're serving from.

Practical consequences:

- It is **not synced** anywhere. It exists on this machine, in this browser.
- **Clearing site data for this origin deletes it.** So does "clear browsing data" with
  site data included.
- A different port or hostname is a **different origin** and therefore a different,
  empty database. `localhost:5173` and `localhost:4173` do not share bookmarks.
- Private/incognito windows get their own throwaway storage.

**Backup:** full database export/restore is Milestone 2. Until then, keep the original
`.html` export from your browser — re-importing it reconstructs everything, and the
importer is idempotent so it won't duplicate.

---

## How it's put together

```
src/
  db/            schema, SQLocal/OPFS client, migrations, repositories, seeding
  features/
    import/      parser, planner, worker client, import UI
  workers/       importWorker.ts — parses files off the main thread
  lib/           url.ts (normalization/hashing), theme.ts, sort.ts
  stores/        zustand — UI state only, never bookmark data
  app/           AppShell, BootGuard
```

The design principle is **pure cores with thin shells**. The three pieces that carry real
complexity — `parseNetscape`, `planImport`, and `lib/url` — are pure functions with no
database or DOM dependency, so they're fully tested in Node without a browser. The Web
Worker is just transport around the parser; the UI just renders the plan object that the
writer executes.

**Tech:** React 19, Vite, TypeScript strict, Tailwind v4, Drizzle ORM, SQLocal (SQLite in
a Worker over OPFS), zustand, tldts, Vitest.

### Data model

Four tables in `src/db/schema.ts`:

- **`bookmarks`** — stores both the original `url` (never modified) and a `normalized_url`
  used only for duplicate comparison, plus its SHA-256 as an indexed `url_hash`.
- **`folders`** — self-referencing tree, unlimited nesting, plus three system folders
  (Unsorted / Pinned / Trash) that can't be renamed or deleted.
- **`import_batches`** — one row per import, so you can filter by "what did that file
  bring in".
- **`settings`** — key/value JSON.

---

## Known limitations — read before filing a bug

These are real constraints, not things I forgot:

1. **No direct browser bookmark access.** Browser security boundary. Export-then-import is
   the only route a web page has.
2. **Cross-origin isolation is mandatory** (see above). This rules out hosts that can't set
   response headers, GitHub Pages among them.
3. **Sorting/browsing UI isn't built yet** (tasks 14–16).
4. Later milestones add in-app link previews — expect most large sites to refuse to render
   in an iframe (`X-Frame-Options`), and metadata fetching to hit CORS. Those features will
   be opt-in and degrade honestly rather than pretending.

---

## If you're picking this back up later

Read the **Gotchas** section of [`STATUS.md`](STATUS.md) before touching `src/db/`. It
documents four bugs that were browser-only — every one of them passed the entire Node test
suite while being completely broken in a real browser. The short version:

- Never run a query through `db` inside a `transaction()` callback — SQLocal deadlocks
  silently. Build with `.toSQL()`, execute through the `Tx` seam.
- The test driver (`better-sqlite3`) and the browser driver (`sqlite-proxy`) return
  different row shapes for raw SQL. Objects vs arrays.
- Importing `src/db/client.ts` spawns a Worker as a side effect of module evaluation.

A test-harness trap now enforces the first one, and the repositories' `QueryDb` type makes
the second fail to compile rather than fail in production. They're written down because
they'll bite again otherwise.

The full design rationale is in `docs/superpowers/specs/`, and the task-by-task
implementation plan is in `docs/superpowers/plans/`.
