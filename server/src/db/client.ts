import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql as drizzleSql } from 'drizzle-orm';
import { schema } from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

/** The handle a `db.transaction(async (tx) => …)` callback receives. */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Either the shared handle or a transaction — for query functions usable in both. */
export type DbExecutor = Db | DbTx;

/**
 * Serialize writers on one logical key for the rest of the transaction
 * (`pg_advisory_xact_lock` — released automatically on commit/rollback).
 */
export async function advisoryXactLock(tx: DbTx, key: string): Promise<void> {
  await tx.execute(drizzleSql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

/**
 * Create a Drizzle client over postgres-js. Used by the app (one shared handle)
 * and by the Testcontainers harness (per-test handle).
 */
export function createDb(databaseUrl: string, opts?: { max?: number }): DbHandle {
  const sql = postgres(databaseUrl, { max: opts?.max ?? 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
