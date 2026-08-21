import type { ServedCredential } from "../auth/auth-file";
import type { TurnRequest } from "./types";

/**
 * An OP is a write the gateway routes to a pool worker instead of waking the
 * agent's pod: the same claim/host-token envelope as a turn, plus the
 * operation. `route` ops run the host's own route handlers against the
 * hydrated workspace; `title` and `conversation` ops are the runtime's own.
 */
export type AgentOp =
  | {
      kind: "route";
      method: string;
      rest: string;
      body?: string;
      contentType?: string;
    }
  | { kind: "title"; text: string }
  | {
      kind: "conversation";
      action: "rename" | "delete";
      conversationId: string;
      title?: string;
    };

export interface OpRequest {
  workspaceId: string;
  agentId: string;
  gcsPrefix: string;
  hostToken: string;
  claim: NonNullable<TurnRequest["claim"]>;
  actingAs?: TurnRequest["actingAs"];
  credential: ServedCredential | null;
  triggersEnabled: boolean;
  op: AgentOp;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;

// The op-route shapes (mirrors the Go classifier): the agent-data families,
// agentfile writes, and skills (install + manage), never a runtime path.
const OP_ROUTE =
  /^(activities|routines|routine_runs|learnings|config)(\/[^/]+)?$|^agentfile\/(?!\.houston\/runtime\/).+$|^skills(\/[^/]+)?$|^skills\/(community|repo)\/install$/;

function parseActing(raw: unknown): TurnRequest["actingAs"] {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as { userId?: unknown; name?: unknown };
  if (typeof a.userId !== "string" || !a.userId) return undefined;
  return {
    userId: a.userId,
    ...(typeof a.name === "string" && a.name ? { name: a.name } : {}),
  };
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`invalid '${field}'`);
  return v;
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
  let op: AgentOp;
  switch (raw.kind) {
    case "route": {
      const method = str(raw.method, "op.method").toUpperCase();
      if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        throw new Error("op.method must be a write method");
      }
      const rest = str(raw.rest, "op.rest");
      if (rest.includes("..") || rest.startsWith("/"))
        throw new Error("invalid 'op.rest'");
      // Defense in depth: the worker accepts only the op-route shapes the
      // gateway classifier dispatches — a valid-token caller cannot reach a
      // handler surface (e.g. POST agentfile) the public path never exposes.
      if (!OP_ROUTE.test(rest)) throw new Error("op.rest is not an op route");
      op = {
        kind: "route",
        method,
        rest,
        ...(typeof raw.body === "string" ? { body: raw.body } : {}),
        ...(typeof raw.contentType === "string"
          ? { contentType: raw.contentType }
          : {}),
      };
      break;
    }
    case "title":
      op = { kind: "title", text: str(raw.text, "op.text") };
      break;
    case "conversation": {
      const action = raw.action;
      if (action !== "rename" && action !== "delete")
        throw new Error("invalid 'op.action'");
      const conversationId = str(raw.conversationId, "op.conversationId");
      if (!ID.test(conversationId))
        throw new Error("invalid 'op.conversationId'");
      if (action === "rename" && typeof raw.title !== "string")
        throw new Error("rename needs 'op.title'");
      op = {
        kind: "conversation",
        action,
        conversationId,
        ...(typeof raw.title === "string" ? { title: raw.title } : {}),
      };
      break;
    }
    default:
      throw new Error("invalid 'op.kind'");
  }
  return {
    workspaceId: str(b.workspaceId, "workspaceId"),
    agentId,
    gcsPrefix,
    hostToken,
    claim: {
      id: str(claim.id, "claim.id"),
      bootId: str(claim.bootId, "claim.bootId"),
      token: str(claim.token, "claim.token"),
      heartbeatUrl: str(claim.heartbeatUrl, "claim.heartbeatUrl"),
    },
    actingAs: parseActing(b.actingAs),

    credential,
    triggersEnabled: b.triggersEnabled === true,
    op,
  };
}
