import { runWorkspaceStoreContract } from "@houston/host/src/testing/store-contract";
import { PgWorkspaceStore } from "./pg";
import { newWorkspacePool } from "./pg-mem-harness";

/**
 * PgWorkspaceStore (CLOSED) run through the SAME WorkspaceStore contract the open
 * Memory/Local adapters pass (runWorkspaceStoreContract is exported from
 * `@houston/host`), backed by an in-process Postgres (pg-mem) preloaded with the
 * real cloud schema (store/pg-mem-harness.ts). It executes REAL SQL — round-trips,
 * snake_case↔domain mapping, RETURNING-driven unknown-id throws, DELETE rowCount.
 *
 * The one concurrent-INSERT race re-read branch of getOrCreatePersonalWorkspace is
 * NOT exercised here (pg-mem's ON CONFLICT DO NOTHING RETURNING semantics diverge
 * and the contract never triggers a true race); that branch stays covered
 * deterministically by the fake-Pool unit test in store/pg.test.ts. The harness
 * header documents exactly what the pg-mem shim bridges and why.
 */
runWorkspaceStoreContract(
  "PgWorkspaceStore (pg-mem)",
  () => new PgWorkspaceStore(newWorkspacePool()),
);
