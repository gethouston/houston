import type { Pool } from "pg";
import { type IMemoryDb, newDb } from "pg-mem";

/**
 * In-process Postgres (pg-mem) wired with the EXACT cloud schema the Pg adapters
 * run against, exposed as a drop-in `pg` Pool so the real adapters
 * (PgWorkspaceStore / PgCredentialStore) can be driven through their shared
 * behavioral contract WITHOUT a docker Postgres.
 *
 * Why a thin query SHIM and not the raw pg-mem Pool:
 *   PgWorkspaceStore.getOrCreatePersonalWorkspace upserts with
 *     ON CONFLICT (owner_user_id) WHERE kind = 'personal' DO NOTHING
 *   i.e. a PARTIAL-INDEX conflict target. pg-mem cannot PARSE the `WHERE`
 *   predicate on a conflict target (it errors at parse time), even though it
 *   correctly ENFORCES the partial unique index itself. The shim rewrites only
 *   that one clause to the bare `ON CONFLICT (owner_user_id)` form — the partial
 *   index pg-mem already maintains makes the bare target resolve to the same
 *   constraint, so the INSERT runs natively.
 *
 * HONEST LIMITATIONS (documented, not faked):
 *   - The conflict RE-READ branch of getOrCreatePersonalWorkspace (a concurrent
 *     INSERT loses the race → DO NOTHING returns 0 rows → re-SELECT the winner)
 *     is NOT exercised here. pg-mem's `ON CONFLICT DO NOTHING ... RETURNING`
 *     returns the conflicting row instead of 0 rows, which would mask that
 *     branch. The contract never triggers a true INSERT race (a second
 *     getOrCreate for the same user short-circuits on the leading SELECT, never
 *     reaching the INSERT), so the divergence does not affect any assertion run
 *     here. That race branch stays covered deterministically by the fake-Pool
 *     unit test in store/pg.test.ts.
 *
 * Everything else — round-trips, snake_case↔domain mapping, bigint expiry,
 * ON CONFLICT upsert-in-place for credentials, per-key isolation, RETURNING-row
 * presence driving the unknown-id throws, DELETE rowCount → no-silent-no-op — is
 * exercised against REAL SQL here.
 */

const PARTIAL_CONFLICT = "ON CONFLICT (owner_user_id) WHERE kind = 'personal'";
const BARE_CONFLICT = "ON CONFLICT (owner_user_id)";

/** The cloud workspaces/agents schema, mirroring the live GKE/Cloud Run DDL. */
const WORKSPACE_SCHEMA = `
  CREATE TABLE workspaces (
    id            text   PRIMARY KEY,
    owner_user_id text   NOT NULL,
    kind          text   NOT NULL,
    name          text   NOT NULL,
    slug          text   NOT NULL,
    runtime       text   NOT NULL,
    created_at    bigint NOT NULL
  );
  -- The partial unique index the personal-workspace upsert conflicts on.
  CREATE UNIQUE INDEX workspaces_personal_owner_uniq
    ON workspaces (owner_user_id) WHERE kind = 'personal';
  CREATE TABLE agents (
    id           text   PRIMARY KEY,
    workspace_id text   NOT NULL,
    name         text   NOT NULL,
    created_at   bigint NOT NULL
  );
`;

/** The workspace_credentials schema (supabase/migrations/..._workspace_credentials.sql). */
const CREDENTIAL_SCHEMA = `
  CREATE TABLE workspace_credentials (
    workspace_id  text   NOT NULL,
    provider      text   NOT NULL,
    access_token  text   NOT NULL,
    refresh_token text   NOT NULL,
    account_id    text,
    expires_at    bigint NOT NULL,
    updated_at    bigint NOT NULL,
    PRIMARY KEY (workspace_id, provider)
  );
`;

/** Wrap pg-mem's Pool so the partial-index conflict target parses (see file header). */
function shim(real: Pool): Pool {
  const query = (text: unknown, params?: unknown[]): unknown => {
    const sql =
      typeof text === "string" && text.includes(PARTIAL_CONFLICT)
        ? text.replace(PARTIAL_CONFLICT, BARE_CONFLICT)
        : text;
    // pg-mem's adapter only supports the (text, params) call form, which is all
    // the adapters use.
    return (real.query as (t: unknown, p?: unknown[]) => unknown)(sql, params);
  };
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "query") return query;
      return Reflect.get(target, prop, receiver);
    },
  }) as Pool;
}

/** A fresh in-process Postgres preloaded with the workspaces + agents schema. */
export function newWorkspacePool(): Pool {
  return makePool(WORKSPACE_SCHEMA);
}

/** A fresh in-process Postgres preloaded with the workspace_credentials schema. */
export function newCredentialPool(): Pool {
  return makePool(CREDENTIAL_SCHEMA);
}

function makePool(schema: string): Pool {
  const db: IMemoryDb = newDb();
  db.public.none(schema);
  const { Pool: PgMemPool } = db.adapters.createPg();
  return shim(new PgMemPool() as Pool);
}
