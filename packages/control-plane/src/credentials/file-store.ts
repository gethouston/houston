import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import type { WorkspaceId } from "../domain/types";

/**
 * File-backed connect-once credential store for the LOCAL profile: the host —
 * not the agent — owns the user's subscription token, persisted to one JSON
 * file on the user's machine so a login survives an app restart. The refresh
 * token lives here (host-readable), never in a runtime's environment, so a
 * prompt-injected agent reading `env` finds only a short-lived access token —
 * the same Gate #2 guarantee as cloud, just single-tenant.
 */
export class FileCredentialStore implements CredentialStore {
  private creds = new Map<string, WorkspaceCredential>();

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      try {
        const raw = JSON.parse(
          readFileSync(path, "utf8"),
        ) as WorkspaceCredential[];
        for (const c of raw)
          this.creds.set(this.key(c.workspaceId, c.provider), c);
      } catch {
        // A corrupt file means the user reconnects — never crash boot over it.
      }
    }
  }

  private key(workspaceId: string, provider: string): string {
    return `${workspaceId}:${provider}`;
  }

  private flush(): void {
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.creds.values()], null, 2));
    renameSync(tmp, this.path); // atomic swap
  }

  async get(
    workspaceId: WorkspaceId,
    provider: string,
  ): Promise<WorkspaceCredential | null> {
    return this.creds.get(this.key(workspaceId, provider)) ?? null;
  }

  async put(cred: WorkspaceCredential): Promise<void> {
    this.creds.set(this.key(cred.workspaceId, cred.provider), { ...cred });
    this.flush();
  }

  async remove(workspaceId: WorkspaceId, provider: string): Promise<void> {
    this.creds.delete(this.key(workspaceId, provider));
    this.flush();
  }
}
