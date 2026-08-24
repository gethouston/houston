import type { ServedCredential } from "../auth/auth-file";
import { type AgentOp, ID, parseAgentOp, str } from "./op-grammar";
import type { TurnRequest } from "./types";

export type { AgentOp } from "./op-grammar";

/**
 * An OP is a write the gateway routes to a pool worker instead of waking the
 * agent's pod: the same claim/host-token envelope as a turn, plus the
 * operation (the op shapes and their parsers live in ./op-grammar).
 */
export interface OpRequest {
  workspaceId: string;
  agentId: string;
  gcsPrefix: string;
  hostToken: string;
  claim: NonNullable<TurnRequest["claim"]>;
  actingAs?: TurnRequest["actingAs"];
  /** The connecting member's acting-as token (their own credential row in a
   *  team space) — only a credential op needs it. */
  actingToken?: string;
  credential: ServedCredential | null;
  triggersEnabled: boolean;
  op: AgentOp;
}

function parseActing(raw: unknown): TurnRequest["actingAs"] {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as { userId?: unknown; name?: unknown };
  if (typeof a.userId !== "string" || !a.userId) return undefined;
  return {
    userId: a.userId,
    ...(typeof a.name === "string" && a.name ? { name: a.name } : {}),
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
  const raw = b.op as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") throw new Error("invalid 'op'");
  return {
    workspaceId: str(b.workspaceId, "workspaceId"),
    agentId,
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
    op: parseAgentOp(raw),
  };
}
