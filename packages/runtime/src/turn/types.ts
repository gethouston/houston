import { normalizeTurnMode, type TurnMode } from "@houston/protocol";
import type { ServedCredential } from "../auth/auth-file";

/**
 * The self-contained turn request the control plane sends. Everything a turn
 * needs rides in: identity (for the GCS prefix), the user's text, and the
 * short-TTL access credential. The runtime holds NO per-tenant state between
 * requests.
 */
export interface TurnRequest {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  text: string;
  /** Echoed on the user frame so the sending client can skip its own message. */
  nonce?: string;
  /** Object-storage prefix that IS this agent ("ws/<workspaceId>/<agentId>"). */
  gcsPrefix: string;
  /** null = workspace not connected yet (the turn fails with a clear error). */
  credential: ServedCredential | null;
  /** Per-turn model override (a routine's pinned model). Absent = inherit. */
  model?: string;
  /** Per-turn reasoning-effort override (a routine's pinned effort). Absent = inherit. */
  effort?: string;
  /**
   * Per-turn execution mode ("plan" = read-only + planning overlay; "auto" =
   * Autopilot, acts without the blocking tools). Absent = execute. Routine fire
   * paths set "auto" so scheduled work never waits for user intervention.
   */
  mode?: TurnMode;
  /**
   * Presentation-only bubble text, when it must differ from `text` (the real
   * prompt the model runs on). Persisted alongside the user message so a
   * history reload renders `displayText ?? content`. Absent when they match.
   */
  displayText?: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PREFIX = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;

/** Validate an untyped body into a TurnRequest. Throws with the real reason. */
export function parseTurnRequest(body: unknown): TurnRequest {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== "object")
    throw new Error("body must be a JSON object");
  for (const field of ["workspaceId", "agentId", "conversationId"] as const) {
    if (typeof b[field] !== "string" || !ID.test(b[field] as string)) {
      throw new Error(`invalid '${field}'`);
    }
  }
  if (typeof b.text !== "string" || !b.text.length)
    throw new Error("missing 'text'");
  const prefix = b.gcsPrefix;
  if (
    typeof prefix !== "string" ||
    !PREFIX.test(prefix) ||
    prefix.includes("..")
  ) {
    throw new Error("invalid 'gcsPrefix'");
  }
  let credential: ServedCredential | null = null;
  if (b.credential != null) {
    const c = b.credential as Record<string, unknown>;
    if (
      typeof c.provider !== "string" ||
      typeof c.access !== "string" ||
      typeof c.expires !== "number"
    ) {
      throw new Error("invalid 'credential'");
    }
    credential = {
      provider: c.provider,
      access: c.access,
      expires: c.expires,
      accountId: typeof c.accountId === "string" ? c.accountId : null,
      kind: c.kind === "api_key" ? "api_key" : "oauth",
    };
  }
  return {
    workspaceId: b.workspaceId as string,
    agentId: b.agentId as string,
    conversationId: b.conversationId as string,
    text: b.text,
    nonce: typeof b.nonce === "string" ? b.nonce : undefined,
    gcsPrefix: prefix,
    credential,
    model: typeof b.model === "string" ? b.model : undefined,
    effort: typeof b.effort === "string" ? b.effort : undefined,
    // Never trust the wire: only the known mode literals ("plan", "auto") pass;
    // anything else normalizes to "execute".
    mode: normalizeTurnMode(b.mode),
    displayText: typeof b.displayText === "string" ? b.displayText : undefined,
  };
}
