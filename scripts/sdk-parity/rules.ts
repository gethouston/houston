import { relative } from "node:path";
import type { RouteDescriptor } from "../../packages/host/src/routes/registry/types.ts";
import {
  type DesktopCalls,
  type GatewayRoute,
  keyOf,
  normalize,
  pathOf,
  repoRoot,
  type SdkMethod,
} from "./inputs.ts";

export type Rule =
  | "sdk-route-unbound"
  | "sdk-method-unserved"
  | "route-served-twice"
  | "proxy-drift"
  | "client-route-unbound";

/** Every rule, in the order the report states them. */
export const RULES: Rule[] = [
  "sdk-route-unbound",
  "sdk-method-unserved",
  "route-served-twice",
  "proxy-drift",
  "client-route-unbound",
];

export interface Violation {
  rule: Rule;
  /** Stable identity an exception entry addresses. */
  key: string;
  message: string;
}

/** R3 within ONE server's list. Host∩gateway overlap is legal and expected. */
function duplicates(
  entries: { key: string; source: string }[],
  side: string,
): Violation[] {
  const sources = new Map<string, string[]>();
  for (const entry of entries) {
    const found = sources.get(entry.key);
    if (found) found.push(entry.source);
    else sources.set(entry.key, [entry.source]);
  }
  return [...sources]
    .filter(([, declared]) => declared.length > 1)
    .map(([key, declared]) => ({
      rule: "route-served-twice" as const,
      key: `${side} ${key}`,
      message: `${side} ${key} is declared ${declared.length} times (${declared.join(", ")})`,
    }));
}

/**
 * The gateway mounts `/x` and `/x/` on ONE handler on purpose (Go's mux would
 * redirect otherwise), and normalising the trailing slash folds the pair into
 * one key — so collapse it before counting declarations.
 */
function gatewayEntries(
  gateway: GatewayRoute[],
): { key: string; source: string }[] {
  return [
    ...new Map(
      gateway.flatMap((route) =>
        route.methods.map((method) => {
          const pattern = normalize(route.pattern);
          return [
            `${method} ${pattern}`,
            { key: keyOf(method, route.pattern), source: pattern },
          ] as const;
        }),
      ),
    ).values(),
  ];
}

/**
 * `gateway` is null when the sibling cloud checkout is absent (CI has none).
 * That is a blind spot, not a pass: the gateway-side rules (R1, the gateway
 * half of R2 and R3) are then not judged at all, and the runner says so — a
 * method the host does not serve is NOT a violation on that run, because the
 * server that would serve it simply was not looked at.
 */
export function checkRules(
  host: RouteDescriptor[],
  gateway: GatewayRoute[] | null,
  sdk: SdkMethod[],
  desktop: DesktopCalls,
): Violation[] {
  const gatewayKnown = gateway !== null;
  const gatewayRoutes = gateway ?? [];
  const sdkKeys = new Set(sdk.flatMap((method) => method.keys));
  const sdkPaths = new Set(
    sdk.flatMap((method) => method.keys.map((key) => pathOf(key))),
  );
  const hostKeys = new Set(
    host.map((route) => keyOf(route.method, route.path)),
  );
  const gatewayKeys = new Set(
    gatewayRoutes.flatMap((route) =>
      route.methods.map((method) => keyOf(method, route.pattern)),
    ),
  );
  // A gateway pattern whose methods are `*` dispatches inside its handler, so
  // any method on that path counts as served.
  const gatewayPaths = new Set(
    gatewayRoutes.map((route) => normalize(route.pattern)),
  );
  const violations: Violation[] = [];

  // R1 — a route a signed-in human can reach, with no SDK method behind it.
  for (const route of host) {
    if (route.classification !== "sdk") continue;
    const key = keyOf(route.method, route.path);
    if (sdkKeys.has(key)) continue;
    violations.push({
      rule: "sdk-route-unbound",
      key: `host ${key}`,
      message: `host ${key} (${route.source}) is classified sdk but no @houston/sdk method issues it — add one, or reclassify with a written reason`,
    });
  }
  for (const route of gatewayRoutes) {
    if (route.classification !== "sdk") continue;
    const keys = route.methods.map((method) => keyOf(method, route.pattern));
    if (keys.some((key) => sdkKeys.has(key))) continue;
    if (route.methods.includes("*") && sdkPaths.has(normalize(route.pattern)))
      continue;
    violations.push({
      rule: "sdk-route-unbound",
      key: `gateway ${keyOf(route.methods[0] ?? "*", route.pattern)}`,
      message: `gateway ${route.methods.join("|")} ${route.pattern} is classified sdk but no @houston/sdk method issues it`,
    });
  }

  // R2 — an SDK method no server answers. ANY of its keys answering is enough:
  // a method whose path parameter is closed to a set issues one call per call
  // site, not one per member, so a deployment that serves `composio` and not
  // `custom` serves the method. What a member costs is only ever the OTHER
  // direction — R1 still reports a literal no member names.
  // Without the gateway inventory only the host can vouch for a method, so a
  // host miss is left unjudged.
  for (const method of sdk) {
    if (
      method.keys.some(
        (key) =>
          hostKeys.has(key) ||
          gatewayKeys.has(key) ||
          gatewayPaths.has(pathOf(key)),
      ) ||
      !gatewayKnown
    )
      continue;
    violations.push({
      rule: "sdk-method-unserved",
      key: `sdk ${method.key}`,
      message: `@houston/sdk ${method.name} issues ${method.key} which no server serves`,
    });
  }

  // R3 — the same key declared twice on one side.
  violations.push(
    ...duplicates(
      host.map((route) => ({
        key: keyOf(route.method, route.path),
        source: `${route.source}#${route.group}`,
      })),
      "host",
    ),
    ...duplicates(gatewayEntries(gatewayRoutes), "gateway"),
  );

  // R4 — a declared runtime-proxy member nothing reaches: the list has gone
  // stale against the client that actually calls the agent's own runtime.
  for (const route of host) {
    if (route.classification !== "runtime-proxy") continue;
    const key = keyOf(route.method, route.path);
    if (sdkKeys.has(key)) continue;
    violations.push({
      rule: "proxy-drift",
      key: `proxy ${key}`,
      message: `runtime-proxy member ${key} (${route.source}) is reached by no @houston/sdk method`,
    });
  }

  // R5 — the inverse of R1, read from the client instead of the servers: a
  // method the shipped app calls that reaches a server on its own. R1 asks
  // whether every reachable route has an SDK method; this asks whether every
  // request the app issues IS one. Both surfaces are covered at once, because
  // the desktop and the web app run this same adapter.
  for (const method of desktop.unbound) {
    violations.push({
      rule: "client-route-unbound",
      key: `client ${method.name}`,
      message: `${relative(repoRoot, method.source)} ${method.name} reaches the host without @houston/sdk — delegate it, or write down why it cannot`,
    });
  }
  return violations;
}
