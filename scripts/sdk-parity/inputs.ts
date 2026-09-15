import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listRoutes } from "../../packages/host/src/routes/registry/all.ts";
import { extractCatalog } from "../../ui/engine-client/scripts/assistant-extractor.ts";
import { assistantPaths } from "../../ui/engine-client/scripts/assistant-paths.ts";

/** The three route sources the parity report joins, and the key it joins on. */

export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** The sibling cloud checkout; HOUSTON_CLOUD_ROOT overrides the default. */
export const gatewayExport = resolve(
  process.env.HOUSTON_CLOUD_ROOT ?? resolve(repoRoot, "..", "cloud"),
  "internal/edge/routes.generated.json",
);

export interface GatewayRoute {
  pattern: string;
  /** Explicit because the gateway dispatches methods inside its handlers. */
  methods: string[];
  classification: string;
  reason?: string;
}

export interface SdkMethod {
  name: string;
  key: string;
}

/**
 * `METHOD /path/{}`. Every parameter spelling folds to one token — the host's
 * `:agentId`, the gateway's `{slug}` and an SDK template's `${id}` name the
 * same segment — and a trailing slash is dropped.
 *
 * A parameter that swallows the REST of the path folds to `{*}` instead, and
 * only to `{*}`: the host's `*rest`, the gateway's Go-mux `{path...}` and an
 * SDK parameter escaped per segment (`relPath`, which keeps its `/`s — the
 * catalog marks it `encoding: "path"`, and `sdkMethods` rewrites it before it
 * gets here) are the same slot, and folding them to `{}` would make a
 * one-segment route and a whole-subtree route compare equal.
 */
export function normalize(path: string): string {
  const folded = path
    .replace(/\*[A-Za-z_][\w-]*/g, "{*}")
    .replace(/\{[^}]*\.\.\.\}/g, "{*}")
    .replace(/\$\{[^}]*\}/g, "{}")
    .replace(/\{[^}*]*\}/g, "{}")
    .replace(/:[^/]+/g, "{}");
  return folded.length > 1 && folded.endsWith("/")
    ? folded.slice(0, -1)
    : folded;
}

export const keyOf = (method: string, path: string): string =>
  `${method.toUpperCase()} ${normalize(path)}`;

export const pathOf = (key: string): string => key.slice(key.indexOf(" ") + 1);

export { listRoutes };

/**
 * The gateway's declared routes, or null when the sibling checkout is absent.
 * Null is a BLIND SPOT, never a pass — the caller must say so out loud.
 */
export function readGateway(): GatewayRoute[] | null {
  if (!existsSync(gatewayExport)) return null;
  return JSON.parse(readFileSync(gatewayExport, "utf8")) as GatewayRoute[];
}

/**
 * The catalog path with its whole-subtree parameters spelled as such: an SDK
 * parameter escaped per segment keeps its `/`s, so `{relPath}` addresses the
 * same slot the host declares as `*rest`, not one segment of it.
 */
function restSpelled(route: {
  path: string;
  pathParams: { name: string; encoding: string }[];
}): string {
  return route.pathParams.reduce(
    (path, param) =>
      param.encoding === "path"
        ? path.replaceAll(`{${param.name}}`, "{...}")
        : path,
    route.path,
  );
}

/**
 * Every `@houston/sdk` method with the route it issues, read by the assistant
 * extractor — the same pass the catalog gate uses, so a method whose path moves
 * inside a `@houston/runtime-client` sub-client is seen here too. Only the SDK's
 * module tree is read: the web adapter is a surface that BINDS the SDK, not a
 * second client whose routes would count as bound.
 */
export function sdkMethods(): {
  routed: SdkMethod[];
  unroutable: { name: string; reason: string }[];
} {
  const { catalog, coverage } = extractCatalog({
    operationSources: assistantPaths.operationSources.filter(
      assistantPaths.isModuleSource,
    ),
    isModuleSource: assistantPaths.isModuleSource,
    transportSource: assistantPaths.transportSource,
    facadeSource: assistantPaths.facadeSource,
    resolverSources: assistantPaths.resolverSources,
  });
  return {
    routed: catalog.operations.flatMap((operation) =>
      operation.route
        ? [
            {
              name: operation.name,
              key: keyOf(operation.route.method, restSpelled(operation.route)),
            },
          ]
        : [],
    ),
    unroutable: coverage.unroutable,
  };
}
