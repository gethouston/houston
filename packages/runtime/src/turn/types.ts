import {
  type ChatMessage,
  normalizeTurnMode,
  parseMentions,
  type TurnMode,
} from "@houston/protocol";
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
  /**
   * The teammates the message @mentions (HOU-944). Structure only: the model
   * runs on `text`, where the names already appear as plain "@Name". Persisted
   * beside the user message and echoed on the `user` frame. Absent when the
   * message mentions nobody.
   */
  mentions?: ChatMessage["mentions"];
  /** Gateway-minted identity reused across a retried dispatch. */
  turnId?: string;
  /** Per-claim gateway token. Secret material, never log this value. */
  hostToken?: string;
  /** Human attribution for machine-dispatched work. */
  actingAs?: { userId: string; name?: string };
  /** Hydrate and resolve the model without calling it or writing back. */
  shadow?: boolean;
  /** Exclusive conversation claim granted to this worker. */
  claim?: {
    id: string;
    bootId: string;
    token: string;
    heartbeatUrl: string;
  };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PREFIX = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid '${field}'`);
  }
  // SAFETY: the object/array check establishes the string-keyed JSON record
  // shape; every consumed property is parsed again below.
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error(`invalid '${field}'`);
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

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
      // Copilot Enterprise routes to a per-tenant API host; dropping it here
      // would silently turn an enterprise credential into a github.com one.
      ...(typeof c.enterpriseUrl === "string" && c.enterpriseUrl
        ? { enterpriseUrl: c.enterpriseUrl }
        : {}),
    };
  }
  if (b.turnId !== undefined && (!nonEmpty(b.turnId) || !ID.test(b.turnId))) {
    throw new Error("invalid 'turnId'");
  }
  if (b.hostToken !== undefined && !nonEmpty(b.hostToken)) {
    throw new Error("invalid 'hostToken'");
  }
  let actingAs: TurnRequest["actingAs"];
  if (b.actingAs !== undefined) {
    const acting = record(b.actingAs, "actingAs");
    exactKeys(acting, ["userId", "name"], "actingAs");
    if (
      !nonEmpty(acting.userId) ||
      (acting.name !== undefined && !nonEmpty(acting.name))
    ) {
      throw new Error("invalid 'actingAs'");
    }
    actingAs = {
      userId: acting.userId,
      ...(acting.name ? { name: acting.name } : {}),
    };
  }
  if (b.shadow !== undefined && typeof b.shadow !== "boolean") {
    throw new Error("invalid 'shadow'");
  }
  let claim: TurnRequest["claim"];
  if (b.claim !== undefined) {
    const parsed = record(b.claim, "claim");
    exactKeys(parsed, ["id", "bootId", "token", "heartbeatUrl"], "claim");
    if (
      !nonEmpty(parsed.id) ||
      !nonEmpty(parsed.bootId) ||
      !nonEmpty(parsed.token) ||
      !nonEmpty(parsed.heartbeatUrl)
    ) {
      throw new Error("invalid 'claim'");
    }
    claim = {
      id: parsed.id,
      bootId: parsed.bootId,
      token: parsed.token,
      heartbeatUrl: parsed.heartbeatUrl,
    };
  }
  if (Boolean(claim) !== Boolean(b.hostToken)) {
    throw new Error("claim and hostToken must be configured together");
  }
  const poolPrefix = prefix.split("/");
  if (
    claim &&
    (poolPrefix.length !== 3 ||
      poolPrefix[0] !== "ws" ||
      !poolPrefix[1] ||
      !poolPrefix[2])
  ) {
    throw new Error("claimed turn has invalid 'gcsPrefix'");
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
    // Same "never trust the wire" posture: junk entries are dropped and an
    // empty list becomes nothing, so a bad sidecar never costs the user a turn.
    mentions: parseMentions(b.mentions),
    turnId: typeof b.turnId === "string" ? b.turnId : undefined,
    hostToken: typeof b.hostToken === "string" ? b.hostToken : undefined,
    actingAs,
    shadow: typeof b.shadow === "boolean" ? b.shadow : undefined,
    claim,
  };
}
