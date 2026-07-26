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

export async function setSetting(db: Db, tx: Tx, key: string, value: unknown): Promise<void> {
  const built = db
    .insert(settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
    .toSQL();
  await tx.exec(built.sql, built.params);
}
