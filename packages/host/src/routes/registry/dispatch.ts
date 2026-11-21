import type { HoustonEvent } from "@houston/protocol";
import { actingAuthorFor } from "../../auth/acting";
import {
  AGENT_NAME_HEADER,
  displayNameFromHeader,
  withDisplayName,
} from "../../auth/agent-name-header";
import type { Agent, UserId, Workspace } from "../../domain/types";
import { authorizeAgent, trustedActingAs } from "../agent-authz";
import { json, methodNotAllowed } from "../http";
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
      declined = true;
      break;
    }
    if (declined) continue;
    if (mismatched && entry.methodMismatch === "405") {
      if (
        entry.phase === "agent" &&
        !(await authorize(entry, ctx, mismatched, userId))
      )
        return true;
      methodNotAllowed(ctx.res);
      return true;
    }
  }
  return false;
}

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
  if (authz.ok) {
    const name = ctx.deps.gatewayFronted
      ? displayNameFromHeader(ctx.req.headers[AGENT_NAME_HEADER])
      : undefined;
    return {
      agentId,
      agent: withDisplayName(authz.agent, name),
      workspace: authz.workspace,
    };
  }
  json(ctx.res, authz.status, { error: authz.reason });
  return null;
}

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

export function listRoutes(): RouteDescriptor[] {
  const routes: RouteDescriptor[] = [];
  for (const group of GROUP_ORDER)
    for (const entry of registeredRoutes().get(group) ?? [])
      routes.push(...entry.descriptors);
  return routes;
}
