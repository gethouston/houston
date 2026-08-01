import { accessDigestMatches } from "@houston/protocol/access-digest";
import type { WorkspaceId } from "../domain/types";
import type {
  CredentialActing,
  CredentialStore,
  WorkspaceCredential,
} from "../ports";
import { credentialScopeKey, isPersonalScopeKey } from "./scope-key";

/**
 * Connect-once credential storage (the OPEN in-memory adapter). The control
 * plane is the SINGLE owner + refresher of each workspace's subscription token;
 * sandboxes only ever serve a fresh access token from here (they never hold the
 * refresh token), so there is no per-agent refresh-token-rotation conflict.
 *
 * MemoryCredentialStore backs dev/tests; the Postgres adapter
 * (PgCredentialStore) was retired with `@houston/host-cloud` (git history).
 * Every adapter is held to one shared contract
 * (credentials/contract.test.ts → runCredentialStoreContract).
 *
 * SCOPE (HOU-976): the acting identity is part of the key, not decoration.
 * Accepting `acting` and ignoring it would serve one member's subscription to
 * another member and let either delete the other's connection — and this adapter
 * IS reachable with a member identity: the dev launcher runs the managed-cloud
 * profile (`HOUSTON_MANAGED_CLOUD=1`, so acting headers are honored) without the
 * credential-gateway env that would select RemoteCredentialStore instead.
 */

export class MemoryCredentialStore implements CredentialStore {
  private readonly creds = new Map<string, WorkspaceCredential>();
  private key(
    workspaceId: string,
    provider: string,
    acting: CredentialActing | undefined,
  ): string {
    return scopedKey(workspaceId, provider, credentialScopeKey(acting));
  }
  async get(
    workspaceId: WorkspaceId,
    provider: string,
    acting?: CredentialActing,
  ): Promise<WorkspaceCredential | null> {
    return this.creds.get(this.key(workspaceId, provider, acting)) ?? null;
  }
  async put(
    cred: WorkspaceCredential,
    opts?: { ifAbsent?: boolean } & CredentialActing,
  ): Promise<void> {
    const key = this.key(cred.workspaceId, cred.provider, opts);
    if (opts?.ifAbsent && this.creds.has(key)) return;
    this.creds.set(key, { ...cred });
  }
  async remove(
    workspaceId: WorkspaceId,
    provider: string,
    acting?: CredentialActing,
  ): Promise<void> {
    this.creds.delete(this.key(workspaceId, provider, acting));
  }
  /** Compare-and-delete: only the reported token goes, never whatever
   *  replaced it (HOU-952) — and only in the REPORTER's own row. */
  async removeIfAccess(
    workspaceId: WorkspaceId,
    provider: string,
    accessSha256: string,
    opts?: { scope?: "personal" | "team" } & CredentialActing,
  ): Promise<boolean> {
    const key = this.key(workspaceId, provider, opts);
    const current = this.creds.get(key);
    if (!current || !accessDigestMatches(current.accessToken, accessSha256))
      return false;
    this.creds.delete(key);
    return true;
  }
}

/**
 * The storage key for one (workspace, provider) row in a scope. The TEAM key
 * omits the scope entirely so it is byte-identical to its pre-HOU-976 form —
 * which is what lets FileCredentialStore read an existing desktop file with no
 * migration.
 */
export function scopedKey(
  workspaceId: string,
  provider: string,
  scopeKey: string,
): string {
  return isPersonalScopeKey(scopeKey)
    ? `${workspaceId}:${scopeKey}:${provider}`
    : `${workspaceId}:${provider}`;
}
