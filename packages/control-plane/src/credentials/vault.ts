import { createHmac, timingSafeEqual } from "node:crypto";
import type { CredentialVault } from "../ports";
import type { AgentId, WorkspaceId } from "../domain/types";
import { config } from "../config";

/**
 * EnvCredentialVault — mints and validates the NON-SECRET sandbox identity
 * tokens. A sandbox carries one as proof of "I am workspace W's agent A" when
 * calling /sandbox/credential. It is an HMAC over {workspaceId, agentId} keyed
 * by `config.sandboxTokenSecret`, so a sandbox cannot forge a token for a
 * different workspace/agent, but the token reveals nothing and grants nothing
 * beyond that one serve endpoint. (Real LLM credentials are the users' own
 * subscriptions in the CredentialStore — there are no org provider keys.)
 *
 * Token wire format: `base64url(payload).base64url(sig)` where
 *   payload = JSON.stringify({ workspaceId, agentId })
 *   sig     = HMAC-SHA256(payload, sandboxTokenSecret)
 */

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
  private readonly secret: string;

  constructor(opts: { secret?: string } = {}) {
    this.secret = opts.secret ?? config.sandboxTokenSecret;
  }

  sandboxToken(workspaceId: WorkspaceId, agentId: AgentId): string {
    const payload = JSON.stringify({
      workspaceId,
      agentId,
    } satisfies SandboxTokenPayload);
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
      parsed = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString("utf8"),
      );
    } catch {
      return null;
    }
    return isValidPayload(parsed)
      ? { workspaceId: parsed.workspaceId, agentId: parsed.agentId }
      : null;
  }

  /** HMAC-SHA256 over the base64url payload, hex-encoded. */
  private sign(payloadB64: string): string {
    return createHmac("sha256", this.secret)
      .update(payloadB64)
      .digest("base64url");
  }
}
