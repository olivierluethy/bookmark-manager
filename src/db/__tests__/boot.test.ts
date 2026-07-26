import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/db/testDb';
import { bootDatabase } from '@/db/boot';
import { folders } from '@/db/schema';

describe('bootDatabase', () => {
  it('runs migrations and seeds exactly the three system folders on a fresh database', async () => {
    const { db, transaction, close } = createTestDb();
    await bootDatabase(db, transaction);
    const rows = await db.select().from(folders);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.systemKey).sort()).toEqual(['pinned', 'trash', 'unsorted']);
    close();
  });

  it('is idempotent: a second boot neither re-runs migrations nor duplicates system folders', async () => {
    const { db, transaction, close } = createTestDb();
    await bootDatabase(db, transaction);
    await bootDatabase(db, transaction);
    expect(await db.select().from(folders)).toHaveLength(3);
    close();
  });
});
