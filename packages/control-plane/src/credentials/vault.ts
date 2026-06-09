import { createHmac, timingSafeEqual } from "node:crypto";
import type { CredentialVault } from "../ports";
import type { AgentId, WorkspaceId } from "../domain/types";
import { config } from "../config";

/**
 * EnvCredentialVault — the keyless story's secret holder.
 *
 * Two distinct kinds of credential live here, and they must never be confused:
 *
 *   1. REAL provider keys (e.g. an Anthropic API key). Held only inside the control plane
 *      process (env / injected map; Secret Manager in prod). `realKeyFor` is the
 *      ONLY accessor, and the keyless proxy is its only caller. A real key is
 *      never returned to, nor reconstructable by, a sandbox.
 *
 *   2. NON-SECRET sandbox tokens. A sandbox carries one of these to the proxy as
 *      proof of "I am workspace W's agent A". It is an HMAC over {workspaceId,agentId}
 *      keyed by `config.sandboxTokenSecret`, so a sandbox cannot forge a token for a
 *      different workspace/agent, but the token reveals nothing and grants nothing on
 *      its own — the proxy still does the real-key swap.
 *
 * Token wire format: `base64url(payload).base64url(sig)` where
 *   payload = JSON.stringify({ workspaceId, agentId })
 *   sig     = HMAC-SHA256(payload, sandboxTokenSecret)
 */

type RealKeyMap = Record<string, string>;

/** Env var name for a workspace's real provider key, e.g. CP_WORKSPACE_KEY_ACME_ANTHROPIC. */
function envKeyName(workspaceId: WorkspaceId, provider: string): string {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `CP_WORKSPACE_KEY_${norm(workspaceId)}_${norm(provider)}`;
}

/** Map-injection key, mirroring the env var name so dev and prod resolve alike. */
function mapKey(workspaceId: WorkspaceId, provider: string): string {
  return envKeyName(workspaceId, provider);
}

interface SandboxTokenPayload {
  workspaceId: WorkspaceId;
  agentId: AgentId;
}

function isValidPayload(value: unknown): value is SandboxTokenPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).workspaceId === "string" &&
    typeof (value as Record<string, unknown>).agentId === "string"
  );
}

export class EnvCredentialVault implements CredentialVault {
  /** Real keys injected directly (tests / dev), keyed exactly like the env vars. */
  private readonly injected: RealKeyMap;
  private readonly secret: string;

  constructor(opts: { keys?: RealKeyMap; secret?: string } = {}) {
    this.injected = opts.keys ?? {};
    this.secret = opts.secret ?? config.sandboxTokenSecret;
  }

  async realKeyFor(workspaceId: WorkspaceId, provider: string): Promise<string | null> {
    const name = mapKey(workspaceId, provider);
    const injected = this.injected[name];
    if (injected !== undefined) return injected;
    const fromEnv = process.env[envKeyName(workspaceId, provider)];
    if (fromEnv !== undefined) return fromEnv;
    // Beta fallback: one central key per provider for every workspace, named
    // CP_<PROVIDER>_KEY (e.g. CP_ANTHROPIC_KEY) — injected map or env.
    const dflt = `CP_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEY`;
    return this.injected[dflt] ?? process.env[dflt] ?? null;
  }

  sandboxToken(workspaceId: WorkspaceId, agentId: AgentId): string {
    const payload = JSON.stringify({ workspaceId, agentId } satisfies SandboxTokenPayload);
    const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
    const sig = this.sign(payloadB64);
    return `${payloadB64}.${sig}`;
  }

  validateSandboxToken(token: string): SandboxTokenPayload | null {
    const dot = token.indexOf(".");
    if (dot <= 0 || dot === token.length - 1) return null;
    const payloadB64 = token.slice(0, dot);
    const presentedSig = token.slice(dot + 1);

    const expectedSig = this.sign(payloadB64);
    // Constant-time compare; reject length-mismatch before timingSafeEqual (which throws).
    const a = Buffer.from(presentedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    return isValidPayload(parsed)
      ? { workspaceId: parsed.workspaceId, agentId: parsed.agentId }
      : null;
  }

  /** HMAC-SHA256 over the base64url payload, hex-encoded. */
  private sign(payloadB64: string): string {
    return createHmac("sha256", this.secret).update(payloadB64).digest("base64url");
  }
}
