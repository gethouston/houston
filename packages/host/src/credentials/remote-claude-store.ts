import {
  mkdirSync,
  readFileSync,
  renameSync,
  unwatchFile,
  watchFile,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { ClaudeOAuthCredential } from "@houston/protocol";

export interface RemoteClaudeCredentialStoreOptions {
  baseUrl: string;
  orgSlug: string;
  agentSlug: string;
  podToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * Mirrors one agent's Claude CLI credential envelope to gateway custody. Claude
 * remains the token refresher; this adapter makes SDK rotations survive an
 * emptyDir/pod replacement without granting the engine pod GCP IAM.
 */
export class RemoteClaudeCredentialStore {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private lastPayload: string | null = null;
  private syncing: Promise<void> = Promise.resolve();
  private watchedPath: string | undefined;

  constructor(private readonly opts: RemoteClaudeCredentialStoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async put(credential: ClaudeOAuthCredential): Promise<void> {
    await this.putEnvelope(JSON.stringify({ claudeAiOauth: credential }));
  }

  /** Restore before the runtime starts. A missing secret is a normal first run. */
  async restore(path: string): Promise<boolean> {
    const response = await this.fetchImpl(this.url(), {
      headers: this.headers(),
    });
    if (response.status === 404) return false;
    if (!response.ok) throw await this.failure(response, "GET");
    const payload = await response.text();
    validateEnvelope(payload);
    writeAtomic0600(path, payload);
    this.lastPayload = payload;
    return true;
  }

  /** Poll the SDK-owned file; atomic CLI rewrites and in-place updates both land. */
  watch(path: string): void {
    if (this.watchedPath === path) return;
    this.stop();
    this.watchedPath = path;
    watchFile(path, { interval: 2_000, persistent: false }, () => {
      this.syncing = this.syncing
        .then(() => this.sync(path))
        .catch((error) => {
          // Never include the payload in logs.
          console.error("[claude-credential-sync] remote update failed", error);
        });
    });
  }

  /** Upload the current valid file, if changed. Used for the shutdown flush. */
  async sync(path: string): Promise<void> {
    let payload: string;
    try {
      payload = readFileSync(path, "utf8");
      validateEnvelope(payload);
    } catch {
      return;
    }
    if (payload === this.lastPayload) return;
    await this.putEnvelope(payload);
  }

  stop(): void {
    if (this.watchedPath) unwatchFile(this.watchedPath);
    this.watchedPath = undefined;
  }

  private async putEnvelope(payload: string): Promise<void> {
    validateEnvelope(payload);
    const response = await this.fetchImpl(this.url(), {
      method: "PUT",
      headers: this.headers({ "content-type": "application/json" }),
      body: payload,
    });
    if (!response.ok) throw await this.failure(response, "PUT");
    this.lastPayload = payload;
  }

  private url(): string {
    return `${this.baseUrl}/v1/pod/claude-oauth/${encodeURIComponent(this.opts.orgSlug)}/${encodeURIComponent(this.opts.agentSlug)}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.opts.podToken}`, ...extra };
  }

  private async failure(response: Response, method: string): Promise<Error> {
    const detail = await response.text().catch(() => "");
    return new Error(
      `Claude credential gateway ${method} failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
}

function validateEnvelope(payload: string): void {
  const parsed = JSON.parse(payload) as {
    claudeAiOauth?: { accessToken?: unknown; refreshToken?: unknown };
  };
  if (
    typeof parsed.claudeAiOauth?.accessToken !== "string" ||
    !parsed.claudeAiOauth.accessToken ||
    typeof parsed.claudeAiOauth.refreshToken !== "string" ||
    !parsed.claudeAiOauth.refreshToken
  ) {
    throw new Error("invalid Claude OAuth credential envelope");
  }
}

function writeAtomic0600(path: string, payload: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, payload, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}
