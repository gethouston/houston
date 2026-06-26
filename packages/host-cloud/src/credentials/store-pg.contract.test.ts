import { runCredentialStoreContract } from "@houston/host/src/testing/credential-contract";
import { newCredentialPool } from "../store/pg-mem-harness";
import { PgCredentialStore } from "./store-pg";

/**
 * PgCredentialStore (CLOSED) run through the SAME CredentialStore contract the
 * open Memory/File adapters pass (runCredentialStoreContract is exported from
 * `@houston/host`), backed by an in-process Postgres (pg-mem) preloaded with the
 * workspace_credentials schema (store/pg-mem-harness.ts). Real SQL exercises the
 * ON CONFLICT (workspace_id, provider) DO UPDATE upsert-in-place, the bigint
 * expiry round-trip, the expiresAt=0 → kind:"api_key" derivation, and PK-scoped
 * isolation/removal.
 */
runCredentialStoreContract(
  "PgCredentialStore (pg-mem)",
  () => new PgCredentialStore(newCredentialPool()),
);
