import type { HoustonEvent } from "@houston/protocol";
import type { UserId } from "../../domain/types";
import { authorizeAgent } from "../agent-authz";
import { json } from "../http";
import { type RegisteredRoute, registeredRoutes } from "./define";
import { GROUP_ORDER, type GroupId, type GroupsIn } from "./groups";
import { matchPath, type PatternMatch } from "./match";
import type {
  AgentEntry,
  DispatchCtx,
  PublicEntry,
  RouteDescriptor,
  UserEntry,
} from "./types";

export { defineProxyFamily, defineRoute, defineRouteFamily } from "./define";
export type { GroupId } from "./groups";
export { GROUP_ORDER, GROUP_PHASES } from "./groups";
export { generalises, matchPath, patternParams } from "./match";
export type {
  AgentCtx,
  Classification,
  HttpMethod,
  Phase,
  PublicCtx,
  RouteDef,
  RouteDescriptor,
  UserCtx,
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
    let pathMatched = false;
    for (const pattern of entry.patterns) {
      const matched = matchPath(pattern.path, ctx.path);
      if (!matched) continue;
      if (pattern.methods && !pattern.methods.some((m) => m === ctx.method)) {
        pathMatched = true;
        continue;
      }
      await run(entry, ctx, matched, userId);
      return true;
    }
    // The family owns its whole path set, so a wrong method anywhere in it is
    // the family's answer to give — never the next route's request to claim.
    if (pathMatched && entry.methodMismatch === "405") {
      json(ctx.res, 405, { error: "method not allowed" });
      return true;
    }
  }
  return false;
}

async function run(
  entry: RegisteredRoute,
  ctx: PublicEntry | UserEntry | AgentEntry,
  matched: PatternMatch,
  userId: UserId | undefined,
): Promise<void> {
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
  if (entry.phase !== "agent") {
    await entry.handler(base);
    return;
  }
  if (userId === undefined)
    throw new Error(`agent-phase group "${entry.group}" ran unauthenticated`);
  const agentId = matched.params.agentId;
  if (agentId === undefined)
    throw new Error(`agent-phase group "${entry.group}" matched no :agentId`);
  const authz = await authorizeAgent(ctx.deps, userId, agentId);
  if (!authz.ok) {
    json(ctx.res, authz.status, { error: authz.reason });
    return;
  }
  const events = ctx.deps.events;
  // Reactivity emits target the workspace owner (the only member, personal tier).
  const emit = events
    ? (event: HoustonEvent) => events.emit(authz.workspace.ownerUserId, event)
    : undefined;
  await entry.handler({
    ...base,
    authz: { agent: authz.agent, workspace: authz.workspace },
    ...(emit ? { emit } : {}),
  });
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
