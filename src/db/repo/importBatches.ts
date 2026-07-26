import { desc } from 'drizzle-orm';
import type { QueryDb, Tx } from '../client';
import { importBatches, type ImportBatch, type NewImportBatch } from '../schema';

export async function recordImportBatch(
  db: QueryDb,
  tx: Tx,
  batch: NewImportBatch,
): Promise<void> {
  const built = db.insert(importBatches).values(batch).toSQL();
  await tx.exec(built.sql, built.params);
}

export function listImportBatches(db: QueryDb): Promise<ImportBatch[]> {
  return db.select().from(importBatches).orderBy(desc(importBatches.importedAt));
}
