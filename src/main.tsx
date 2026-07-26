import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { sql } from 'drizzle-orm';
import { App } from '@/App';
import { BootGuard } from '@/app/BootGuard';
import { db, transaction } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import '@/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

// TEMP: manual OPFS round-trip verification for Task 6, step 7. Remove this
// block (and the two console.log calls) once a real browser has confirmed:
//   1. the console lists folders, bookmarks, import_batches, settings, migrations
//   2. a hard refresh does not re-run migrations (proves OPFS persisted)
//   3. `foreign_keys` reports 1, not 0 (proves the per-connection pragma took effect)
const rows = await db
  .all<{ id: string; hash: string }>(sql`SELECT id, hash FROM migrations`)
  .catch(() => []);
await transaction((tx) => runMigrations(tx, new Map(rows.map((r) => [r.id, r.hash]))));
console.log('migrations ok', await db.all(sql`SELECT name FROM sqlite_master WHERE type='table'`));
console.log('foreign_keys =', await db.all(sql`PRAGMA foreign_keys`));

createRoot(rootElement).render(
  <StrictMode>
    <BootGuard>
      <App />
    </BootGuard>
  </StrictMode>,
);
