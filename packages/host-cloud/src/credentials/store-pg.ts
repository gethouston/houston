import type { WorkspaceId } from "@houston/host/src/domain/types";
import type {
  CredentialStore,
  WorkspaceCredential,
} from "@houston/host/src/ports";
import type { Pool } from "pg";

/**
 * The live (closed) Postgres connect-once credential store — the cloud half of
 * the credentials/store.ts split. The open in-memory adapter
 * (MemoryCredentialStore) stays in `@houston/host`; this is the production store
 * backing the `workspace_credentials` migration. Same interface, same semantics;
 * the two are held to one shared contract (runCredentialStoreContract, exported
 * from `@houston/host`).
 */

interface CredRow {
  workspace_id: string;
  provider: string;
  access_token: string;
  refresh_token: string;
  account_id: string | null;
  expires_at: string; // bigint → string over the wire
}

export class PgCredentialStore implements CredentialStore {
  constructor(private readonly pool: Pool) {}

  async get(
    workspaceId: WorkspaceId,
    provider: string,
  ): Promise<WorkspaceCredential | null> {
    const res = await this.pool.query<CredRow>(
      `SELECT workspace_id, provider, access_token, refresh_token, account_id, expires_at
         FROM workspace_credentials
        WHERE workspace_id = $1 AND provider = $2`,
      [workspaceId, provider],
    );
    const r = res.rows[0];
    if (!r) return null;
    const expiresAt = Number(r.expires_at);
    return {
      workspaceId: r.workspace_id,
      provider: r.provider,
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      accountId: r.account_id ?? undefined,
      expiresAt,
      // No dedicated column: the expiresAt=0 sentinel (set on every api-key put)
      // distinguishes a pasted key from an OAuth token, so no migration is needed.
      kind: expiresAt === 0 ? "api_key" : "oauth",
    };
  }

  async put(c: WorkspaceCredential): Promise<void> {
    await this.pool.query(
      `INSERT INTO workspace_credentials
         (workspace_id, provider, access_token, refresh_token, account_id, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (workspace_id, provider) DO UPDATE SET
         access_token  = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         account_id    = EXCLUDED.account_id,
         expires_at    = EXCLUDED.expires_at,
         updated_at    = EXCLUDED.updated_at`,
      [
        c.workspaceId,
        c.provider,
        c.accessToken,
        c.refreshToken,
        c.accountId ?? null,
        c.expiresAt,
        Date.now(),
      ],
    );
  }

  async remove(workspaceId: WorkspaceId, provider: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM workspace_credentials WHERE workspace_id = $1 AND provider = $2`,
      [workspaceId, provider],
    );
  }
}
