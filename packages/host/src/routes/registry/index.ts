import type { HoustonEvent } from "@houston/protocol";
import { actingAuthorFor } from "../../auth/acting";
import type { Agent, UserId, Workspace } from "../../domain/types";
import { authorizeAgent, trustedActingAs } from "../agent-authz";
import { json } from "../http";
import type {
  AgentEntry,
  DispatchCtx,
  PublicEntry,
  UserEntry,
} from "./context";
import { type RegisteredRoute, registeredRoutes } from "./define";
import { GROUP_ORDER, type GroupId, type GroupsIn } from "./groups";
import { matchPath, type PatternMatch } from "./match";
import type { RouteDescriptor } from "./types";

export type { AgentCtx, PublicCtx, UserCtx } from "./context";
export type { RegisteredPattern, RegisteredRoute } from "./define";
export {
  defineProxyFamily,
  defineRoute,
  defineRouteFamily,
  registeredRoutes,
} from "./define";
export type { GroupId } from "./groups";
export { GROUP_ORDER, GROUP_PHASES } from "./groups";
export { generalises, matchPath, patternParams } from "./match";
export type {
  Classification,
  HttpMethod,
  Phase,
  RouteDef,
  RouteDescriptor,
} from "./types";

/**
 * Run one group's routes in declaration order; true when one answered.
 *
 * A group occupies exactly the chain slot its hand-written handler did, so
 * calling them in server.ts's existing order reproduces the existing order
 * exactly. The overloads bind each group to the context its phase requires:
 * a `phase: "user"` route is unreachable from a caller with no user id.
 */
export function dispatchGroup(
  group: GroupsIn<"public" | "sandbox">,
  ctx: PublicEntry,
): Promise<boolean>;
export function dispatchGroup(
  group: GroupsIn<"user">,
  ctx: UserEntry,
): Promise<boolean>;
export function dispatchGroup(
  group: GroupsIn<"agent">,
  ctx: AgentEntry,
): Promise<boolean>;
export async function dispatchGroup(
  group: GroupId,
  ctx: PublicEntry | UserEntry | AgentEntry,
): Promise<boolean> {
  const entries = registeredRoutes().get(group);
  if (!entries) return false;
  const userId = "userId" in ctx ? ctx.userId : undefined;
  for (const entry of entries) {
    let mismatched: PatternMatch | null = null;
    let declined = false;
    for (const pattern of entry.patterns) {
      const matched = matchPath(pattern.path, ctx.path);
      if (!matched) continue;
      if (pattern.methods && !pattern.methods.some((m) => m === ctx.method)) {
        mismatched ??= matched;
        continue;
      }
      if (await run(entry, ctx, matched, userId)) return true;
      // The handler looked and said the request is not its own, so the chain
      // walks on — including past this entry's other patterns, which would
      // reach the same handler for the same answer.
      declined = true;
      break;
    }
    if (declined) continue;
    // The family owns its whole path set, so a wrong method anywhere in it is
    // the family's answer to give — never the next route's request to claim.
    if (mismatched && entry.methodMismatch === "405") {
      // An agent-phase family sits BEHIND the ownership check, so a caller who
      // does not own the agent gets 403/404 and never learns which methods it
      // serves — the order routes/agent-file.ts and routes/agent-data.ts
      // already have, since their 405 is written after authorizeAgent ran.
      if (
        entry.phase === "agent" &&
        !(await authorize(entry, ctx, mismatched, userId))
      )
        return true;
      json(ctx.res, 405, { error: "method not allowed" });
      return true;
    }
  }
  return false;
}

/**
 * The agent phase's ownership check. Null means the refusal is already written
 * to the response and the caller must stop.
 */
async function authorize(
  entry: RegisteredRoute,
  ctx: PublicEntry | UserEntry | AgentEntry,
  matched: PatternMatch,
  userId: UserId | undefined,
): Promise<{ agentId: string; agent: Agent; workspace: Workspace } | null> {
  if (userId === undefined)
    throw new Error(`agent-phase group "${entry.group}" ran unauthenticated`);
  const agentId = matched.params.agentId;
  if (agentId === undefined)
    throw new Error(`agent-phase group "${entry.group}" matched no :agentId`);
  const authz = await authorizeAgent(ctx.deps, userId, agentId);
  if (authz.ok)
    return { agentId, agent: authz.agent, workspace: authz.workspace };
  json(ctx.res, authz.status, { error: authz.reason });
  return null;
}

/** Run one matched route; false when its handler declined the request. */
async function run(
  entry: RegisteredRoute,
  ctx: PublicEntry | UserEntry | AgentEntry,
  matched: PatternMatch,
  userId: UserId | undefined,
): Promise<boolean> {
  const base: DispatchCtx = {
    deps: ctx.deps,
    method: ctx.method,
    path: ctx.path,
    url: ctx.url,
    req: ctx.req,
    res: ctx.res,
    params: matched.params,
    rest: matched.rest,
    ...(userId === undefined ? {} : { userId }),
  };
  if (entry.phase !== "agent") return (await entry.handler(base)) !== false;
  const authz = await authorize(entry, ctx, matched, userId);
  if (!authz) return true;
  const events = ctx.deps.events;
  // Reactivity emits target the workspace owner (the only member, personal tier).
  const emit = events
    ? (event: HoustonEvent) => events.emit(authz.workspace.ownerUserId, event)
    : undefined;
  const actingAs = trustedActingAs(ctx.deps, ctx.req);
  const answer = await entry.handler({
    ...base,
    authz: { agent: authz.agent, workspace: authz.workspace },
    agentId: authz.agentId,
    actingAuthor: actingAuthorFor(ctx.deps, ctx.req),
    ...(actingAs ? { actingAs } : {}),
    ...(emit ? { emit } : {}),
  });
  return answer !== false;
}

/**
 * Every registered `METHOD path` pair, in chain order. Pure data — no server,
 * no deps bag — so the SDK parity gate reads it without booting anything.
 */
export function listRoutes(): RouteDescriptor[] {
  const routes: RouteDescriptor[] = [];
  for (const group of GROUP_ORDER)
    for (const entry of registeredRoutes().get(group) ?? [])
      routes.push(...entry.descriptors);
  return routes;
}
