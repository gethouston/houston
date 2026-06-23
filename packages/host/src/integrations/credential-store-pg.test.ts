import { expect, test } from "bun:test";
import type { Pool } from "pg";
import { newDb } from "pg-mem";
import {
  type IntegrationCredentialStore,
  MemoryIntegrationCredentialStore,
} from "./credential-store";
import { PgIntegrationCredentialStore } from "./credential-store-pg";
import type { ProviderCredential } from "./types";

const cred = (apiKey: string): ProviderCredential => ({
  provider: "composio",
  data: { apiKey, userId: "consumer-1" },
});

/**
 * A fresh in-process Postgres (pg-mem) with the production table applied. The
 * `pg`-drop-in Pool it hands back is what the store talks to — no docker, real
 * SQL (parameterized queries, ON CONFLICT upsert, jsonb round-trip all execute
 * exactly as they would against live Postgres). The store runs no DDL (it
 * mirrors PgCredentialStore), so the test owns schema setup just as the
 * `integration_credentials` migration does in prod.
 */
function freshPool(): Pool {
  const db = newDb();
  db.public.none(`
    CREATE TABLE integration_credentials (
      user_id    text  NOT NULL,
      provider   text  NOT NULL,
      data       jsonb NOT NULL,
      updated_at bigint NOT NULL,
      PRIMARY KEY (user_id, provider)
    );
  `);
  const { Pool: PgMemPool } = db.adapters.createPg();
  return new PgMemPool() as unknown as Pool;
}

// The exact same contract the Memory/File stores are held to — run against both
// the Pg store and the Memory store here so parity is explicit, not implied.
function contract(name: string, make: () => IntegrationCredentialStore) {
  test(`${name}: get/put/remove, keyed per (user, provider)`, async () => {
    const s = make();
    expect(await s.get("u1", "composio")).toBeNull();

    await s.put("u1", cred("uak_1"));
    expect((await s.get("u1", "composio"))?.data.apiKey).toBe("uak_1");

    // Different users are isolated.
    expect(await s.get("u2", "composio")).toBeNull();
    await s.put("u2", cred("uak_2"));
    expect((await s.get("u2", "composio"))?.data.apiKey).toBe("uak_2");
    expect((await s.get("u1", "composio"))?.data.apiKey).toBe("uak_1");

    await s.remove("u1", "composio");
    expect(await s.get("u1", "composio")).toBeNull();
    expect((await s.get("u2", "composio"))?.data.apiKey).toBe("uak_2");
  });
}

contract(
  "MemoryIntegrationCredentialStore",
  () => new MemoryIntegrationCredentialStore(),
);
contract(
  "PgIntegrationCredentialStore",
  () => new PgIntegrationCredentialStore(freshPool()),
);

test("PgIntegrationCredentialStore: put upserts (ON CONFLICT) in place", async () => {
  const s = new PgIntegrationCredentialStore(freshPool());
  await s.put("u1", cred("uak_old"));
  await s.put("u1", cred("uak_new"));
  // Same (user, provider) → one row, latest value, not a duplicate.
  expect((await s.get("u1", "composio"))?.data.apiKey).toBe("uak_new");
});

test("PgIntegrationCredentialStore: opaque jsonb data round-trips intact", async () => {
  const s = new PgIntegrationCredentialStore(freshPool());
  const full: ProviderCredential = {
    provider: "composio",
    data: {
      apiKey: "uak_x",
      userId: "consumer-1",
      orgId: "org_9",
      nested: { a: 1 },
    },
  };
  await s.put("u1", full);
  const got = await s.get("u1", "composio");
  expect(got?.data).toEqual(full.data);
});

test("PgIntegrationCredentialStore: a row persists across store instances on the same DB", async () => {
  // The real bug this fixes: a connected account must outlive the process that
  // wrote it. The Pool is the durable layer; a fresh store over the same Pool
  // (a restarted replica reconnecting to the same Postgres) still sees the row.
  const pool = freshPool();
  const a = new PgIntegrationCredentialStore(pool);
  await a.put("u1", cred("uak_persist"));

  const b = new PgIntegrationCredentialStore(pool);
  expect((await b.get("u1", "composio"))?.data.apiKey).toBe("uak_persist");
});

test("PgIntegrationCredentialStore: a query error propagates (no silent swallow)", async () => {
  // No table → the SELECT throws; the store must NOT swallow it (beta no-silent-
  // failures policy). A missing table surfaces as a real rejection.
  const db = newDb();
  const { Pool: PgMemPool } = db.adapters.createPg();
  const s = new PgIntegrationCredentialStore(
    new PgMemPool() as unknown as Pool,
  );
  await expect(s.get("u1", "composio")).rejects.toThrow();
});
