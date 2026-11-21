import { relative } from "node:path";
import type { RouteDescriptor } from "../../packages/host/src/routes/registry/types.ts";
import type { GatewayRoute } from "./gateway-inventory.ts";
import {
  type DesktopCalls,
  keyOf,
  normalize,
  pathOf,
  repoRoot,
  type SdkMethod,
} from "./inputs.ts";
import { ANY_KEY_PATHS } from "./route-paths.ts";

export type Rule =
  | "sdk-route-unbound"
  | "sdk-method-unserved"
  | "route-served-twice"
  | "proxy-drift"
  | "client-route-unbound";

export const RULES: Rule[] = [
  "sdk-route-unbound",
  "sdk-method-unserved",
  "route-served-twice",
  "proxy-drift",
  "client-route-unbound",
];

export interface Violation {
  rule: Rule;
  key: string;
  message: string;
}

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
  gatewayRoutes: GatewayRoute[],
  sdk: SdkMethod[],
  desktop: DesktopCalls,
): Violation[] {
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
  const gatewayPaths = new Set(
    gatewayRoutes.map((route) => normalize(route.pattern)),
  );
  const violations: Violation[] = [];

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

  const anyKey = [...hostKeys, ...gatewayKeys].filter((key) =>
    ANY_KEY_PATHS.has(pathOf(key)),
  );
  const servesLiteral = (served: string, key: string) =>
    served.split("/").length === key.split("/").length &&
    key.startsWith(served.slice(0, -"{}".length));
  for (const method of sdk) {
    if (
      method.keys.some(
        (key) =>
          hostKeys.has(key) ||
          gatewayKeys.has(key) ||
          gatewayPaths.has(pathOf(key)) ||
          anyKey.some((served) => servesLiteral(served, key)),
      )
    )
      continue;
    violations.push({
      rule: "sdk-method-unserved",
      key: `sdk ${method.key}`,
      message: `@houston/sdk ${method.name} issues ${method.key} which no server serves`,
    });
  }

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

  for (const method of desktop.unbound) {
    violations.push({
      rule: "client-route-unbound",
      key: `client ${method.name}`,
      message: `${relative(repoRoot, method.source)} ${method.name} reaches the host without @houston/sdk — delegate it, or write down why it cannot`,
    });
  }
  return violations;
}
