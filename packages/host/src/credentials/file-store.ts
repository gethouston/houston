import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
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

/**
 * File-backed connect-once credential store for the LOCAL profile: the host —
 * not the agent — owns the user's subscription token, persisted to one JSON
 * file on the user's machine so a login survives an app restart. The refresh
 * token lives here (host-readable), never in a runtime's environment, so a
 * prompt-injected agent reading `env` finds only a short-lived access token —
 * the same Gate #2 guarantee as cloud, just single-tenant.
 *
 * SCOPE (HOU-976): rows are keyed by acting identity as well as (workspace,
 * provider). Desktop and self-host never carry one (the acting header is dropped
 * off the gateway — routes/agents.ts `trustedActingAs`), so their key AND their
 * on-disk record stay byte-identical to the pre-HOU-976 shape: an existing
 * credentials.json loads with no migration and never gains a field. Only a
 * member's row persists `scopeKey`, and only the profiles that can produce one
 * write it — the dev launcher runs the managed-cloud posture
 * (`HOUSTON_MANAGED_CLOUD=1`) without the credential-gateway env that would
 * select RemoteCredentialStore, so this adapter really does see members there.
 */

/** One persisted row: the credential plus WHOSE it is (absent = the team's). */
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
      } catch {
        // A corrupt file means the user reconnects — never crash boot over it.
      }
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
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.creds.values()], null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(tmp, this.path); // atomic swap
    chmodSync(this.path, 0o600);
  }

  async get(
    workspaceId: WorkspaceId,
    provider: string,
    acting?: CredentialActing,
  ): Promise<WorkspaceCredential | null> {
    const stored = this.creds.get(this.key(workspaceId, provider, acting));
    if (!stored) return null;
    // `scopeKey` is this store's own bookkeeping, not part of the port's shape.
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
      // Omitted for the team so its record keeps its exact historical shape.
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

  /** Compare-and-delete under this process's single-threaded map access — the
   *  local equivalent of the gateway's row lock (HOU-952). Only the REPORTER's
   *  own row is eligible: both rows can hold the same token, and dropping the
   *  wrong one signs somebody else out. */
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
