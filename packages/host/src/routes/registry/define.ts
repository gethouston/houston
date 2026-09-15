import type { DispatchCtx } from "./context";
import { GROUP_PHASES } from "./groups";
import { patternParams } from "./match";
import type {
  Classification,
  GroupId,
  HttpMethod,
  MethodMismatch,
  Phase,
  ProxyFamilyDef,
  RouteDef,
  RouteDescriptor,
  RouteFamilyDef,
} from "./types";

/** One pattern the dispatcher tries, with the methods it answers for. */
export interface RegisteredPattern {
  path: string;
  /** null = every method (the runtime proxy family, which forwards them all). */
  methods: HttpMethod[] | null;
}

/** One `define*` call, as the dispatcher and the parity gate read it back. */
export interface RegisteredRoute {
  group: GroupId;
  phase: Phase;
  methodMismatch: MethodMismatch;
  patterns: RegisteredPattern[];
  /** What `listRoutes()` publishes for this entry — a family expands here. */
  descriptors: RouteDescriptor[];
  handler(ctx: DispatchCtx): unknown;
}

const registry = new Map<GroupId, RegisteredRoute[]>();

/** Every registered route, grouped, in the order server.ts calls the groups. */
export function registeredRoutes(): ReadonlyMap<GroupId, RegisteredRoute[]> {
  return registry;
}

const asArray = (method: HttpMethod | HttpMethod[]): HttpMethod[] =>
  Array.isArray(method) ? method : [method];

/**
 * A route is registered once, at import time, so every check here fails the
 * process on boot rather than on the one request that would have exposed it.
 */
function register(entry: RegisteredRoute): void {
  if (GROUP_PHASES[entry.group] !== entry.phase)
    throw new Error(
      `route group "${entry.group}" runs in phase "${GROUP_PHASES[entry.group]}", not "${entry.phase}"`,
    );
  if (entry.phase === "agent")
    for (const pattern of entry.patterns)
      if (!patternParams(pattern.path).includes("agentId"))
        throw new Error(
          `agent-phase route "${pattern.path}" must capture the agent as :agentId`,
        );
  const group = registry.get(entry.group);
  if (group) group.push(entry);
  else registry.set(entry.group, [entry]);
}

function describe(
  def: {
    group: GroupId;
    phase: Phase;
    classification: Classification;
    reason?: string;
    source: string;
  },
  members: { method: HttpMethod; path: string }[],
): RouteDescriptor[] {
  return members.map((member) => ({
    method: member.method,
    path: member.path,
    classification: def.classification,
    phase: def.phase,
    ...(def.reason ? { reason: def.reason } : {}),
    source: def.source,
    group: def.group,
  }));
}

/** One method (or method set) on one path. */
export function defineRoute(def: RouteDef): void {
  const methods = asArray(def.method);
  register({
    group: def.group,
    phase: def.phase,
    methodMismatch: def.methodMismatch ?? "fallthrough",
    patterns: [{ path: def.path, methods }],
    descriptors: describe(
      def,
      methods.map((method) => ({ method, path: def.path })),
    ),
    handler: def.handler,
  });
}

/** One handler serving an enumerated set of pairs it owns as a unit. */
export function defineRouteFamily(def: RouteFamilyDef): void {
  const byPath = new Map<string, HttpMethod[] | null>();
  for (const member of def.members) {
    const methods = byPath.get(member.path);
    if (methods) methods.push(member.method);
    else byPath.set(member.path, [member.method]);
  }
  // An owned path answers for EVERY method, so it widens the pattern a member
  // already declared rather than adding a second one the matcher would reach
  // only after that member had its say.
  for (const path of def.owns ?? []) byPath.set(path, null);
  register({
    group: def.group,
    phase: def.phase,
    methodMismatch: def.methodMismatch ?? "fallthrough",
    patterns: [...byPath].map(([path, methods]) => ({ path, methods })),
    descriptors: describe(def, def.members),
    handler: def.handler,
  });
}

/** The catch-all forward to the agent's runtime. Enumerable, not a wildcard. */
export function defineProxyFamily(def: ProxyFamilyDef): void {
  register({
    group: def.group,
    phase: def.phase,
    methodMismatch: "fallthrough",
    patterns: [{ path: def.path, methods: null }],
    descriptors: describe(
      { ...def, classification: "runtime-proxy" },
      def.members.map((member) => ({
        method: member.method,
        path: `/agents/:agentId/${member.rest}`,
      })),
    ),
    handler: def.handler,
  });
}
