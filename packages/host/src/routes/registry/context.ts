/**
 * What a route handler is HANDED, as opposed to what a route declares
 * (registry/types.ts). Split out because the two answer different questions
 * and only this half depends on the server's dependency bags — nothing here
 * imports a declaration type, so the dependency runs one way.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import type { Agent, UserId, Workspace } from "../../domain/types";
import type { ControlPlaneDeps } from "../../server";
import type { AgentRouteDeps } from "../agent-authz";

/** The request, before a pattern has claimed it. */
interface Located {
  method: string;
  /** `url.pathname` — the raw, undecoded path the chain matches on. */
  path: string;
  url: URL;
  req: IncomingMessage;
  res: ServerResponse;
}

export interface PublicEntry extends Located {
  deps: ControlPlaneDeps;
}

export interface UserEntry extends PublicEntry {
  userId: UserId;
}

/**
 * The agent phase's entry. Its deps are the narrower per-agent bag because the
 * slot it is called from (routes/agents.ts) holds exactly that — and every
 * ControlPlaneDeps satisfies it, so server.ts can call an agent group too.
 */
export interface AgentEntry extends Located {
  deps: AgentRouteDeps;
  userId: UserId;
}

/** What the pattern captured. */
interface Matched {
  /** Decoded `:name` captures, keyed by the name in the pattern. */
  params: Record<string, string>;
  /** The `*rest` capture, RAW (the channel forwards it undecoded); "" if none. */
  rest: string;
}

export interface PublicCtx extends PublicEntry, Matched {}
export interface UserCtx extends UserEntry, Matched {}
export interface AgentCtx extends AgentEntry, Matched {
  authz: { agent: Agent; workspace: Workspace };
  /** The agent the ownership check ran on — the decoded `:agentId` segment. */
  agentId: string;
  /** Reactivity fan-out to the workspace owner; absent when no hub is wired. */
  emit?: (event: HoustonEvent) => void;
  /**
   * WHO this request acts as, decided once by the dispatcher so no per-agent
   * route can reopen the trust hole by reading the header itself (see
   * routes/agent-authz.ts `trustedActingAs` and auth/acting.ts): the raw
   * gateway-minted token a credential write hands the channel, and the same
   * identity as a contributor for what gets stamped onto the agent's files.
   * Both are empty off the gateway, where an inbound acting header is
   * untrusted client input.
   */
  actingAs?: string;
  actingAuthor: ActivityContributor | null;
}

/**
 * What the dispatcher hands a handler, before the phase narrows it. The
 * optional fields are present exactly when the route's phase says they are:
 * GROUP_PHASES fixes each group's phase, `register()` refuses a route whose
 * phase disagrees, and `dispatchGroup`'s overloads refuse a caller that cannot
 * supply what the phase needs — which is why a `handler(ctx: UserCtx)` may be
 * stored here.
 */
export interface DispatchCtx extends Located, Matched {
  deps: AgentRouteDeps;
  userId?: UserId;
  authz?: { agent: Agent; workspace: Workspace };
  agentId?: string;
  emit?: (event: HoustonEvent) => void;
  actingAs?: string;
  actingAuthor?: ActivityContributor | null;
}
