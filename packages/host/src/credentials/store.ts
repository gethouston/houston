import type { WorkspaceId } from "../domain/types";
import type { CredentialStore, WorkspaceCredential } from "../ports";

/**
 * Connect-once credential storage (the OPEN in-memory adapter). The control
 * plane is the SINGLE owner + refresher of each workspace's subscription token;
 * sandboxes only ever serve a fresh access token from here (they never hold the
 * refresh token), so there is no per-agent refresh-token-rotation conflict.
 *
 * MemoryCredentialStore backs dev/tests; the live Postgres adapter
 * (PgCredentialStore) lives in `@houston/host-cloud` (credentials/store-pg.ts) —
 * same interface, same semantics. The two are held to one shared contract
 * (credentials/contract.test.ts → runCredentialStoreContract).
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
