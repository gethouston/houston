import { ACTING_VIA_ASSISTANT } from "@houston/host/src/auth/acting";
import { validDisplayName } from "@houston/host/src/auth/agent-name-header";
import { parseTurnLimits, type TurnLimits } from "@houston/protocol";
import { type AgentOp, ID, parseAgentOp, str } from "./op-grammar";
import { customOAuthCallbackUrl } from "./op-grammar-custom-oauth";
import { parseTurnCredential } from "./parse-turn-credential";
import type { TurnCredential, TurnRequest } from "./types";

export type { AgentOp } from "./op-grammar";

/**
 * The acting human of an op, plus `via: "assistant"` when the gateway
 * verified the caller is the AI Manager's credential (PRODUCT-1928): the op
 * twin of the acting-as token's `via` claim an awake pod reads. Trusted for
 * the same reason `userId` is: an envelope reaches `/op` only from the
 * gateway (deployment IAM + the pool's X-Internal-Token), which builds it
 * from its own verified principal, never from client input.
 */
export type OpActingAs = NonNullable<TurnRequest["actingAs"]> & {
  via?: typeof ACTING_VIA_ASSISTANT;
};

/**
 * An OP is a write the gateway routes to a pool worker instead of waking the
 * agent's pod: the same claim/host-token envelope as a turn, plus the
 * operation (the op shapes and their parsers live in ./op-grammar).
 */
export interface OpRequest {
  workspaceId: string;
  agentId: string;
  /** The gateway registry's display name. The folder never follows a cloud
   *  rename, so handlers print this; an invalid value is simply absent. */
  agentName?: string;
  gcsPrefix: string;
  hostToken: string;
  claim: NonNullable<TurnRequest["claim"]>;
  actingAs?: OpActingAs;
  /** The connecting member's acting-as token (their own credential row in a
   *  team space) — only a credential op needs it. */
  actingToken?: string;
  credential: TurnCredential | null;
  triggersEnabled: boolean;
  customOAuthCallbackUrl?: string;
  /** The acting person's plan limits, stamped by the gateway like a turn's:
   *  a routine write this op makes is held to their floor. */
  limits?: TurnLimits;
  op: AgentOp;
}

// An unknown `via` reads as absent rather than failing the op: the write is
// still the acting human's, it just earns no "Started by Houston" tag.
function parseActing(raw: unknown): OpActingAs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as { userId?: unknown; name?: unknown; via?: unknown };
  if (typeof a.userId !== "string" || !a.userId) return undefined;
  return {
    userId: a.userId,
    ...(typeof a.name === "string" && a.name ? { name: a.name } : {}),
    ...(a.via === ACTING_VIA_ASSISTANT ? { via: ACTING_VIA_ASSISTANT } : {}),
  };
}

export function parseOpRequest(body: unknown): OpRequest {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== "object")
    throw new Error("body must be a JSON object");
  const claim = b.claim as Record<string, unknown> | undefined;
  if (!claim || typeof claim !== "object")
    throw new Error("ops require a claim");
  const hostToken = str(b.hostToken, "hostToken");
  const gcsPrefix = str(b.gcsPrefix, "gcsPrefix");
  if (gcsPrefix.split("/").length !== 3 || !gcsPrefix.startsWith("ws/")) {
    throw new Error("invalid 'gcsPrefix'");
  }
  const agentId = str(b.agentId, "agentId");
  if (!ID.test(agentId)) throw new Error("invalid 'agentId'");
  const credential = parseTurnCredential(b.credential);
  const raw = b.op as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") throw new Error("invalid 'op'");
  const agentName = validDisplayName(b.agentName);
  // A garbled stamp is no limit, never a failed op (parseTurnLimits).
  const limits = parseTurnLimits(b.limits);
  return {
    workspaceId: str(b.workspaceId, "workspaceId"),
    agentId,
    ...(agentName ? { agentName } : {}),
    gcsPrefix,
    hostToken,
    ...(typeof b.actingToken === "string" && b.actingToken
      ? { actingToken: b.actingToken }
      : {}),
    claim: {
      id: str(claim.id, "claim.id"),
      bootId: str(claim.bootId, "claim.bootId"),
      token: str(claim.token, "claim.token"),
      heartbeatUrl: str(claim.heartbeatUrl, "claim.heartbeatUrl"),
    },
    actingAs: parseActing(b.actingAs),

    credential,
    triggersEnabled: b.triggersEnabled === true,
    ...(limits ? { limits } : {}),
    ...(b.customOAuthCallbackUrl !== undefined
      ? {
          customOAuthCallbackUrl: customOAuthCallbackUrl(
            b.customOAuthCallbackUrl,
          ),
        }
      : {}),
    op: parseAgentOp(raw),
  };
}
