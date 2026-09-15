import type { AgentCtx, PublicCtx, UserCtx } from "./context";
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
 * is the declared array order.
 *
 * Only the agent phase gives the dispatcher a principal to enforce: a sandbox
 * route validates its own HMAC token inside its handler, and the phase marks
 * only the chain slot it answers from. Lifting that check into the dispatcher
 * would move the refusal for every sandbox family at once, so it stays where
 * each family owns it.
 */
export type Phase =
  | "public" // before any auth
  | "sandbox" // HMAC sandbox token the handler itself validates
  | "user" // after principal()'s 401 wall and the agents store fence
  | "agent"; // "user" + authorizeAgent(agentId) run by the dispatcher

/**
 * What a path match with the WRONG method does. The chain has BOTH answers
 * deliberately and the split is per-handler: routes/account.ts falls through to
 * the chain's 404, routes/agent-color.ts blanket-405s. "405" emits exactly
 * `{ error: "method not allowed" }`; a family whose 405 body carries more than
 * that (routes/missions-remote-inbound.ts adds `code`) declares every method
 * and answers from inside its own handler instead.
 *
 * WHEN the 405 is emitted follows the phase: an agent-phase family's 405 is
 * written after authorizeAgent (routes/agent-file.ts, routes/agent-data.ts),
 * so a caller who does not own the agent sees 403/404 and never learns the
 * method set; a user-phase one (routes/agent-color.ts) answers before any
 * per-agent check because its slot sits ahead of the per-agent dispatch
 * entirely.
 */
export type MethodMismatch = "fallthrough" | "405";

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

/**
 * What a handler hands back. `false` DECLINES the request: the chain walks on
 * to the next route. It is how a family that claims a boundary wider than its
 * route list (`owns`) gives back what turns out not to be its own —
 * routes/custom-integrations-user.ts claims the whole `custom/` subtree and
 * declines a target its grammar does not know, which is the only reason
 * `/v1/integrations/custom/connections` still reaches the generic provider
 * family behind it. Anything else means "answered".
 */
// `void` is the point: a handler that answered by writing to the response
// returns nothing, and only `void` accepts the `Promise<void>` an async
// handler with no return statement has — `undefined` would reject every one.
// biome-ignore lint/suspicious/noConfusingVoidType: see above.
export type Answer = Promise<boolean | void> | boolean | void;

export type Phased =
  | { phase: "public" | "sandbox"; handler(ctx: PublicCtx): Answer }
  | { phase: "user"; handler(ctx: UserCtx): Answer }
  | { phase: "agent"; handler(ctx: AgentCtx): Answer };

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
  Phased & {
    members: { method: HttpMethod; path: string }[];
    /**
     * Patterns the family answers on for EVERY method while publishing no
     * descriptor of its own — the boundary the regex owns beyond the pairs it
     * serves. routes/transcripts-sandbox.ts refuses anything else inside its
     * conversation prefix with its own 400, and routes/assistant-sandbox.ts
     * 405s a wrong method with a body that carries a `code`: falling through
     * either would answer the 401 wall instead.
     */
    owns?: string[];
  };

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
   * stays `*rest`, so an unlisted rest reaches the channel all the same — this
   * LIST is what the parity gate reads, and rule R4 proves it against the
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
