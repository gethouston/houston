import type { RouteDescriptor } from "../../packages/host/src/routes/registry/types.ts";
import {
  type GatewayRoute,
  keyOf,
  normalize,
  pathOf,
  type SdkMethod,
} from "./inputs.ts";

export type Rule =
  | "sdk-route-unbound"
  | "sdk-method-unserved"
  | "route-served-twice"
  | "proxy-drift";

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

export function checkRules(
  host: RouteDescriptor[],
  gateway: GatewayRoute[],
  sdk: SdkMethod[],
): Violation[] {
  const sdkKeys = new Set(sdk.map((method) => method.key));
  const sdkPaths = new Set(sdk.map((method) => pathOf(method.key)));
  const hostKeys = new Set(
    host.map((route) => keyOf(route.method, route.path)),
  );
  const gatewayKeys = new Set(
    gateway.flatMap((route) =>
      route.methods.map((method) => keyOf(method, route.pattern)),
    ),
  );
  // A gateway pattern whose methods are `*` dispatches inside its handler, so
  // any method on that path counts as served.
  const gatewayPaths = new Set(
    gateway.map((route) => normalize(route.pattern)),
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
  for (const route of gateway) {
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

  // R2 — an SDK method no server answers.
  for (const method of sdk) {
    if (
      hostKeys.has(method.key) ||
      gatewayKeys.has(method.key) ||
      gatewayPaths.has(pathOf(method.key))
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
    ...duplicates(gatewayEntries(gateway), "gateway"),
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
  return violations;
}
