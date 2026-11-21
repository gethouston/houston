import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { accessDigestMatches } from "@houston/protocol/access-digest";
import type { WorkspaceId } from "../domain/types";
import type {
  CredentialActing,
  CredentialStore,
  WorkspaceCredential,
} from "../ports";
import {
  credentialScopeKey,
  isPersonalScopeKey,
  TEAM_SCOPE_KEY,
} from "./scope-key";
import { scopedKey } from "./store";

type StoredCredential = WorkspaceCredential & { scopeKey?: string };

export class FileCredentialStore implements CredentialStore {
  private creds = new Map<string, StoredCredential>();

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      try {
        const raw = JSON.parse(
          readFileSync(path, "utf8"),
        ) as StoredCredential[];
        for (const c of raw)
          this.creds.set(
            scopedKey(c.workspaceId, c.provider, c.scopeKey ?? TEAM_SCOPE_KEY),
            c,
          );
      } catch {}
    }
  }

  private key(
    workspaceId: string,
    provider: string,
    acting: CredentialActing | undefined,
  ): string {
    return scopedKey(workspaceId, provider, credentialScopeKey(acting));
  }

  private flush(): void {
    const tmp = atomicTempPath(this.path);
    writeFileSync(tmp, JSON.stringify([...this.creds.values()], null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(tmp, this.path);
    chmodSync(this.path, 0o600);
  }

  async get(
    workspaceId: WorkspaceId,
    provider: string,
    acting?: CredentialActing,
  ): Promise<WorkspaceCredential | null> {
    const stored = this.creds.get(this.key(workspaceId, provider, acting));
    if (!stored) return null;
    const { scopeKey: _scopeKey, ...cred } = stored;
    return cred;
  }

  async put(
    cred: WorkspaceCredential,
    opts?: { ifAbsent?: boolean } & CredentialActing,
  ): Promise<void> {
    const scopeKey = credentialScopeKey(opts);
    const key = scopedKey(cred.workspaceId, cred.provider, scopeKey);
    if (opts?.ifAbsent && this.creds.has(key)) return;
    this.creds.set(key, {
      ...cred,
      ...(isPersonalScopeKey(scopeKey) ? { scopeKey } : {}),
    });
    this.flush();
  }

  async remove(
    workspaceId: WorkspaceId,
    provider: string,
    acting?: CredentialActing,
  ): Promise<void> {
    this.creds.delete(this.key(workspaceId, provider, acting));
    this.flush();
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
    this.flush();
    return true;
  }
}
