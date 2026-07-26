# Milestone 1 — Status

Local-first bookmark manager. React 19 + Vite + Tailwind v4 + Drizzle over SQLite in the
browser (SQLocal/OPFS). No login, no server, no network calls.

**Last updated:** 2026-07-26
**Branch:** `milestone-1` (merged to `main`)
**Tests:** 132 passing across 16 files
**Plan:** `docs/superpowers/plans/2026-07-26-bookmark-manager-milestone-1.md`
**Spec:** `docs/superpowers/specs/2026-07-26-bookmark-manager-milestone-1-design.md`

---

## Done

- [x] **1. Scaffold** — Vite + React 19 + TS strict + Tailwind v4, pnpm, ESLint/Prettier,
      COOP/COEP `credentialless` headers in dev *and* preview, static preview server.
- [x] **2. Theme system** — three-state light/dark/system toggle, persisted, `system`
      default, no flash on load. Self-hosted Fraunces + Inter (no CDN).
- [x] **3. App shell** — resizable/collapsible three panes, layout persisted, keyboard
      accessible dividers.
- [x] **4. URL utilities** — `normalizeUrl` / `urlHash` / `siteOf`, tracking-param
      stripping, eTLD+1 via tldts.
- [x] **5. Drizzle schema** — `folders`, `bookmarks`, `import_batches`, `settings`, all
      five required indexes + a partial unique index on `system_key`.
- [x] **6. Database layer** — SQLocal/OPFS client, `Tx` seam, migration runner, BootGuard.
      Verified in a real browser: OPFS persists, migrations run once, FKs enforced.
- [x] **7. Seeding + settings + boot** — idempotent Unsorted/Pinned/Trash, settings
      repository, `bootDatabase` behind an exclusive Web Lock.
- [x] **8. Repositories** — folders (tree, path, descendant guard, delete-with-reassign),
      bookmarks (filters, counts, rollup, hash lookup, open tracking), import batches.
- [x] **9. Browser detection** — Brave/Chrome/Edge/Firefox/Safari/Arc/Opera + per-browser
      export instructions with copy-to-clipboard for internal URLs.
- [x] **10. Netscape parser** — nested folders, `ADD_DATE`, `ICON`, `TAGS`, `<DD>`,
      `PERSONAL_TOOLBAR_FOLDER`, `place:` skipping, never throws. Chrome/Firefox/malformed
      fixtures.
- [x] **11. Import planning** — root stripping, case-insensitive path merge, idempotent
      re-import, duplicate classification, three placement modes.
- [x] **12. Import worker + apply** — off-main-thread parsing, batched 500-row
      transactions, import batch records.

- [x] **13. Import UI** — drag-and-drop, click-to-pick, and `Ctrl+V` paste; live-replanning
      preview with real counts; percentage progress for parse and insert; per-file error
      surfacing; designed empty and error states. **The app is usable end to end from
      here** — you can import a real browser export and the data persists.

## Not started

- [ ] **14. Folder tree sidebar** — recursive tree, persisted expand/collapse, live counts
      with an include-subfolders toggle, ARIA tree semantics.
- [ ] **15. Selection + virtualized list** — anchor/shift/ctrl selection model,
      `@tanstack/react-virtual`, list + compact rows, open-in-new-tab tracking.
- [ ] **16. Detail pane, sort, view modes** — offline-only detail tier (normalization
      diff, folder path, same-site bookmarks), sort controls, card grid, app assembly.
- [ ] **17. Filter controls** — site, tag, source browser, import batch, untagged,
      never-opened, added-before. Query layer already exists and is tested; only the UI
      controls are missing.
- [ ] **18. Polish** — 20k-bookmark performance pass, accessibility pass, `README.md`.

---

## Deferred to Milestone 2 (by design, not oversight)

Drag & drop, undo stack, duplicate/similarity detection and the cleanup view, MiniSearch
search + command palette, trash & 30-day retention, export & sharing, iframe preview &
metadata enrichment, link-health checks, the Rediscover panel, the AI layer, and the PWA
offline shell.

The groundwork is in place: the selection model is drag-ready, `normalizedUrl`/`urlHash`
are already computed at write time so dedup is an index lookup, and the schema already
carries `deletedAt` / `isPinned` / `previewImage` / `lastOpenedAt` / `openCount`.

---

## Known issues and follow-ups

Carried from review; none are blocking.

- `src/lib/url.ts` — a URL with an empty username but a set password
  (`https://:secret@example.com/a`) still drops the password and collides with the bare
  URL. One-line fix (`u.username || u.password`). Unreachable in practice.
- `eslint.config.js` scopes all rules to `**/*.{ts,tsx}`, so `scripts/*.mjs` is linted by
  nothing — "lint clean" is partly vacuous until that is widened.
- `tsconfig.node.json` is dead configuration; nothing references it.
- `scripts/preview-server.mjs` and `src/styles.css` are not Prettier-formatted.
- The import modal has no full focus trap — Tab can reach the page behind it. Escape,
  backdrop-click and the close button all work and are disabled while an import runs.
- After a successful import the app calls `window.location.reload()` to refresh the
  library, since there is no live DB subscription yet.
- No test covers a throw originating in `tx.all` (as opposed to `tx.exec`) inside a
  transaction.
- The parser's tests run against `linkedom`, which nests unclosed `<DT>` tags differently
  from a browser's native `DOMParser`. The implementation tolerates both shapes, but
  folder hierarchy from a real export is worth confirming in a browser.

---

## Gotchas for anyone continuing this

These caused real, browser-only bugs. All four passed the full Node test suite.

1. **Never execute a query through `db` inside a `transaction()` callback.** SQLocal holds
   an exclusive connection lock, so it deadlocks silently and forever. Inside a
   transaction `db` may only *build* statements via `.toSQL()`; execute through
   `tx.exec` / `tx.all`. A test-harness trap enforces this and is on by default.
2. **A `.toSQL()`-built SELECT run via `tx.all` returns raw snake_case keys**, not
   Drizzle's camelCase. `system_key`, not `systemKey`.
3. **`db.all()` with a raw SQL template returns row *objects* under better-sqlite3 and row
   *arrays* under the browser's sqlite-proxy driver.** This made migrations re-run on
   every reload while every test passed.
4. **Importing `src/db/client.ts` spawns a Worker** — it constructs `SQLocalDrizzle` at
   module scope. `main.tsx` therefore checks the environment first and only reaches it via
   a dynamic `await import()`. A static import anywhere eagerly loaded defeats BootGuard.

Repositories take `QueryDb`, not `Db` — it deliberately excludes `run`/`all`/`get`/
`values`/`batch`/`transaction`, so a driver-divergent call now fails to compile.

## Running it

```bash
pnpm install
pnpm dev            # dev server with the required COOP/COEP headers
pnpm build          # static bundle
pnpm serve:dist     # serve dist/ with the required headers
pnpm test
```

The app **requires** `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless`. Without them the browser blocks OPFS and
the app refuses to start rather than silently discarding data.
