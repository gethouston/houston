import { ACTING_VIA_ASSISTANT } from "@houston/host/src/auth/acting";
import { validDisplayName } from "@houston/host/src/auth/agent-name-header";
import { parseTurnLimits, type TurnLimits } from "@houston/protocol";
import { type AgentOp, ID, parseAgentOp, str } from "./op-grammar";
import { customOAuthCallbackUrl } from "./op-grammar-custom-oauth";
import { parseTurnCredential } from "./parse-turn-credential";
import type { TurnCredential, TurnRequest } from "./types";

export type { AgentOp } from "./op-grammar";

export type OpActingAs = NonNullable<TurnRequest["actingAs"]> & {
  via?: typeof ACTING_VIA_ASSISTANT;
};

export interface OpRequest {
  workspaceId: string;
  agentId: string;
  agentName?: string;
  gcsPrefix: string;
  hostToken: string;
  claim: NonNullable<TurnRequest["claim"]>;
  actingAs?: OpActingAs;
  actingToken?: string;
  credential: TurnCredential | null;
  triggersEnabled: boolean;
  customOAuthCallbackUrl?: string;
  limits?: TurnLimits;
  op: AgentOp;
}

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
