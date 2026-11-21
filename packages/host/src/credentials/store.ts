import { accessDigestMatches } from "@houston/protocol/access-digest";
import type { WorkspaceId } from "../domain/types";
import type {
  CredentialActing,
  CredentialStore,
  WorkspaceCredential,
} from "../ports";
import { credentialScopeKey, isPersonalScopeKey } from "./scope-key";

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

export function scopedKey(
  workspaceId: string,
  provider: string,
  scopeKey: string,
): string {
  return isPersonalScopeKey(scopeKey)
    ? `${workspaceId}:${scopeKey}:${provider}`
    : `${workspaceId}:${provider}`;
}
