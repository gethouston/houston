import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, UserId, Workspace } from "../../domain/types";
import type { ControlPlaneDeps } from "../../server";
import type { AgentRouteDeps } from "../agent-authz";
import type { GroupId } from "./groups";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export type Classification =
  | "sdk"
  | "internal-sandbox"
  | "internal-control-plane"
  | "infra"
  | "runtime-proxy";

/**
 * WHERE in server.ts's fixed pipeline a route is matched. Order INSIDE a phase
 * is the declared array order — identical to the hand-written chain order.
 */
export type Phase =
  | "public" // before any auth
  | "sandbox" // HMAC sandbox token; after the coordinator-scope refusal
  | "user" // after principal()'s 401 wall and the agents store fence
  | "agent"; // "user" + authorizeAgent(agentId) already ran

/**
 * What a path match with the WRONG method does. The chain has BOTH answers
 * deliberately and the split is per-handler: routes/account.ts falls through to
 * the chain's 404, routes/agent-color.ts blanket-405s. "405" emits exactly
 * `{ error: "method not allowed" }`; a family whose 405 body carries more than
 * that (routes/missions-remote-inbound.ts adds `code`) declares every method
 * and answers from inside its own handler instead.
 */
export type MethodMismatch = "fallthrough" | "405";

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
  /** Reactivity fan-out to the workspace owner; absent when no hub is wired. */
  emit?: (event: HoustonEvent) => void;
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
  emit?: (event: HoustonEvent) => void;
}

/** The entry context a group's phase requires of its caller. */
export type EntryFor<P extends Phase> = P extends "agent"
  ? AgentEntry
  : P extends "user"
    ? UserEntry
    : PublicEntry;

interface RouteCommon {
  group: GroupId;
  method: HttpMethod | HttpMethod[];
  /** ":name" = one segment (decoded); "*rest" = the remainder, >=1 segment. */
  path: string;
  /** Repo-relative module that owns the match, e.g. "routes/agents.ts". */
  source: string;
  methodMismatch?: MethodMismatch;
}

/** Only `sdk` needs no justification; every other bucket states its reason. */
export type Classified =
  | { classification: "sdk"; reason?: undefined }
  | { classification: Exclude<Classification, "sdk">; reason: string };

export type Phased =
  | {
      phase: "public" | "sandbox";
      handler(ctx: PublicCtx): Promise<void> | void;
    }
  | { phase: "user"; handler(ctx: UserCtx): Promise<void> | void }
  | { phase: "agent"; handler(ctx: AgentCtx): Promise<void> | void };

export type { GroupId } from "./groups";

export type RouteDef = RouteCommon & Classified & Phased;

/**
 * One handler serving an ENUMERATED set of pairs it owns as a unit — the regex
 * handlers whose "not mine" boundary and whose family-wide 405 are behaviour,
 * not an accident of how they were written. `listRoutes()` expands `members`
 * one entry per pair; the matcher keeps them under the single handler.
 *
 * Spelled out rather than `Omit<RouteDef, ...>`: RouteDef is a union, and Omit
 * over a union erases the per-phase handler signature.
 */
export type RouteFamilyDef = Omit<RouteCommon, "method" | "path"> &
  Classified &
  Phased & { members: { method: HttpMethod; path: string }[] };

/** The catch-all forward to the agent's own runtime. Enumerable, not a wildcard. */
export type ProxyFamilyDef = Omit<
  RouteCommon,
  "method" | "path" | "methodMismatch"
> & {
  path: "/agents/:agentId/*rest";
  phase: "agent";
  classification: "runtime-proxy";
  reason: string;
  /**
   * The rests the agent's runtime serves, from the two tables that already
   * exist (packages/runtime's transport routes and turn/dispatch.ts). Matching
   * stays `*rest`, so an unlisted rest reaches the channel exactly as today —
   * this LIST is what the parity gate reads, and rule R4 proves it against the
   * client that actually calls it.
   */
  members: { method: HttpMethod; rest: string }[];
  handler(ctx: AgentCtx): Promise<void> | void;
};

/** One `METHOD path` pair, as the SDK parity gate reads it. */
export interface RouteDescriptor {
  method: HttpMethod;
  path: string;
  classification: Classification;
  phase: Phase;
  reason?: string;
  source: string;
  group: GroupId;
}
