import type { Pool } from "pg";
import type { WorkspaceId } from "../domain/types";
import type { CredentialStore, WorkspaceCredential } from "../ports";

/**
 * Connect-once credential storage. The control plane is the SINGLE owner +
 * refresher of each workspace's subscription token; sandboxes only ever serve a
 * fresh access token from here (they never hold the refresh token), so there is
 * no per-agent refresh-token-rotation conflict.
 *
 * MemoryCredentialStore backs dev/tests; PgCredentialStore is the live store
 * (the workspace_credentials migration). Same interface, same semantics.
 */

export class MemoryCredentialStore implements CredentialStore {
  private readonly creds = new Map<string, WorkspaceCredential>();
  private key(workspaceId: string, provider: string): string {
    return `${workspaceId}:${provider}`;
  }
  async get(
    workspaceId: WorkspaceId,
    provider: string,
  ): Promise<WorkspaceCredential | null> {
    return this.creds.get(this.key(workspaceId, provider)) ?? null;
  }
  async put(cred: WorkspaceCredential): Promise<void> {
    this.creds.set(this.key(cred.workspaceId, cred.provider), { ...cred });
  }
  async remove(workspaceId: WorkspaceId, provider: string): Promise<void> {
    this.creds.delete(this.key(workspaceId, provider));
  }
}

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
    return r
      ? {
          workspaceId: r.workspace_id,
          provider: r.provider,
          accessToken: r.access_token,
          refreshToken: r.refresh_token,
          accountId: r.account_id ?? undefined,
          expiresAt: Number(r.expires_at),
        }
      : null;
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
