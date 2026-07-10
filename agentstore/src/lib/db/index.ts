import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "@/db/schema";

/**
 * Drizzle database client — the SINGLE `db` export the whole app uses.
 *
 *   import { db } from "@/lib/db";
 *   import * as schema from "@/db/schema";
 *
 * Driver: postgres-js (drizzle-orm/postgres-js). It is the only Postgres driver
 * that runs on Cloudflare Workers; `pg`/node-postgres is not Workers-compatible.
 * `prepare: false` is REQUIRED for Supabase's transaction-mode pooler (PgBouncer),
 * which does not support prepared-statement caching.
 *
 * Lazy + import-safe: nothing connects at import time and there is NO top-level
 * await, so route modules import cleanly during `next build` page-data
 * collection. The connection is established on the first query. Transactions go
 * through `db.transaction(...)`.
 */

type DbClient = PostgresJsDatabase<typeof schema>;

// Cache across Next dev HMR and warm Worker isolates so we never open duplicate
// connection pools for the same process.
const globalForDb = globalThis as unknown as {
  __agentStoreSql?: Sql;
  __agentStoreDb?: DbClient;
};

function getSql(): Sql {
  if (globalForDb.__agentStoreSql) return globalForDb.__agentStoreSql;
  const url = process.env.AGENTSTORE_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "AGENTSTORE_DATABASE_URL is not set. The Agent Store database is unavailable — " +
        "set AGENTSTORE_DATABASE_URL to the Supabase Postgres connection string " +
        "(the transaction-mode pooler URL) before running any query.",
    );
  }
  const client = postgres(url, { prepare: false });
  globalForDb.__agentStoreSql = client;
  return client;
}

function getDb(): DbClient {
  if (globalForDb.__agentStoreDb) return globalForDb.__agentStoreDb;
  const client = drizzle(getSql(), { schema });
  globalForDb.__agentStoreDb = client;
  return client;
}

/**
 * The Drizzle client bound to the full schema. Use this everywhere.
 *
 * A get-trap proxy defers connection to first property access, so merely
 * importing `db` never touches the network or reads env — only an actual query
 * (or a missing `AGENTSTORE_DATABASE_URL`) surfaces an error.
 */
export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * Close the underlying postgres connection, if one was opened. For one-shot
 * scripts (e.g. the seed) that must let the process exit; long-running app
 * handlers never call this.
 */
export async function closeDbConnection(): Promise<void> {
  const client = globalForDb.__agentStoreSql;
  if (!client) return;
  await client.end();
  globalForDb.__agentStoreSql = undefined;
  globalForDb.__agentStoreDb = undefined;
}

export type DB = typeof db;
