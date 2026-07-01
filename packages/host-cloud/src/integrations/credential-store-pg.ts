import type { UserId } from "@houston/host/src/domain/types";
import type { IntegrationCredentialStore } from "@houston/host/src/integrations/credential-store";
import type { ProviderCredential } from "@houston/host/src/integrations/types";
import type { Pool } from "pg";

/**
 * Postgres-backed integration credential store — the CLOUD profile's home for a
 * user's own "Composio for you" account key. Closed-destined (it imports `pg`),
 * so it lives in its own file and only `main.ts` constructs it; nothing else may
 * import it (enforced by check-boundaries.mjs / BOUNDARY.md).
 *
 * Mirrors PgCredentialStore (credentials/store.ts) exactly: takes a shared `pg`
 * Pool, runs NO in-code DDL (the table is owned by the
 * `integration_credentials` migration — supabase/migrations/), uses
 * parameterized SQL with an `INSERT … ON CONFLICT DO UPDATE` upsert, and is
 * keyed on the same (user_id, provider) primary key the interface demands.
 *
 * No silent failures: every method awaits `pool.query` and lets the pg error
 * propagate (no `.catch`, no swallow). Surfacing is the caller's concern.
 *
 * This is what makes a connected account survive a replica restart — the cloud
 * profile previously fell back to the in-memory store, so credentials evaporated.
 */

interface CredRow {
  user_id: string;
  provider: string;
  data: Record<string, unknown>; // jsonb → object over the pg wire
}

export class PgIntegrationCredentialStore
  implements IntegrationCredentialStore
{
  constructor(private readonly pool: Pool) {}

  async get(
    userId: UserId,
    provider: string,
  ): Promise<ProviderCredential | null> {
    const res = await this.pool.query<CredRow>(
      `SELECT user_id, provider, data
         FROM integration_credentials
        WHERE user_id = $1 AND provider = $2`,
      [userId, provider],
    );
    const r = res.rows[0];
    if (!r) return null;
    return { provider: r.provider, data: r.data };
  }

  async put(userId: UserId, cred: ProviderCredential): Promise<void> {
    await this.pool.query(
      `INSERT INTO integration_credentials (user_id, provider, data, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         data       = EXCLUDED.data,
         updated_at = EXCLUDED.updated_at`,
      [userId, cred.provider, JSON.stringify(cred.data), Date.now()],
    );
  }

  async remove(userId: UserId, provider: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM integration_credentials WHERE user_id = $1 AND provider = $2`,
      [userId, provider],
    );
  }
}
