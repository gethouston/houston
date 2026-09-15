import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DESKTOP_NATIVE_COMMANDS } from "../../app/src/lib/desktop-native-commands.ts";
import { listRoutes } from "../../packages/host/src/routes/registry/all.ts";
import type {
  AssistantParameter,
  AssistantRoute,
} from "../../ui/engine-client/scripts/assistant-catalog-types.ts";
import { extractCatalog } from "../../ui/engine-client/scripts/assistant-extractor.ts";
import { assistantPaths } from "../../ui/engine-client/scripts/assistant-paths.ts";
import { type AdapterMethod, classifyAdapter } from "./adapter-methods.ts";
import { routePaths } from "./route-paths.ts";

/** The four client/route sources the parity report joins, and the join key. */

export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** The gateway's own routes are the fourth source; `./gateway-inventory.ts`
 *  resolves them from the copy vendored into this repo. */

export interface SdkMethod {
  name: string;
  /** The parameterised key, and the identity an exception addresses. */
  key: string;
  /**
   * Every key the method binds: `key`, plus one per member of a path parameter
   * the catalog closes to a fixed set (see {@link routePaths}). A server that
   * declares a member literally binds through one of those.
   */
  keys: string[];
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
 * Every `@houston/sdk` method with the route it issues, read by the assistant
 * extractor — the same pass the catalog gate uses, so a method whose path moves
 * inside a `@houston/runtime-client` sub-client is seen here too. Only the SDK's
 * module tree is read: the web adapter is a surface that BINDS the SDK, not a
 * second client whose routes would count as bound.
 */
/** What the SHIPPED app does, split three ways. */
export interface DesktopCalls {
  /** Adapter methods that delegate their request to an `@houston/sdk` method. */
  sdk: AdapterMethod[];
  /** Tauri commands the desktop is declared to reach natively (§ the rule in
   *  `app/src/lib/desktop-native-commands.ts`); the native boundary's own gate
   *  is `scripts/check-desktop-native.mjs`. */
  native: string[];
  /** Adapter methods that reach a server with no SDK method behind them. */
  unbound: AdapterMethod[];
}

/** Every non-test `.ts` under `directory`, at any depth. */
function sourcesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourcesUnder(join(directory, entry.name))
      : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
        ? [join(directory, entry.name)]
        : [],
  );
}

/**
 * The client side of parity: what the app the user runs actually issues.
 *
 * The adapter is read WHOLE (`cp/` and the helper modules beside the mixins,
 * not just `client/*-mixin.ts`) because a mixin method's request is usually
 * made one or two calls deeper; only the mixin classes publish methods, so
 * only they are classified. One adapter covers both surfaces — the desktop
 * aliases `@houston-ai/engine-client` to it and `packages/web` composes the
 * same `app/src` — so there is no separate desktop input to keep in step.
 */
export function desktopCalls(): DesktopCalls {
  const methods = classifyAdapter(
    sourcesUnder(resolve(repoRoot, "packages/web/src/engine-adapter")),
  );
  return {
    sdk: methods.filter((method) => method.bound),
    native: DESKTOP_NATIVE_COMMANDS.map(([command]) => command),
    unbound: methods.filter((method) => method.unbound),
  };
}

/**
 * One `@houston/sdk` method as the report joins it: the route it issues, under
 * every key it binds.
 */
export function sdkMethodOf(
  name: string,
  route: AssistantRoute,
  params: AssistantParameter[],
): SdkMethod {
  const [path, ...members] = routePaths(route, params);
  const key = keyOf(route.method, path);
  return {
    name,
    key,
    keys: [key, ...members.map((member) => keyOf(route.method, member))],
  };
}

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
        ? [sdkMethodOf(operation.name, operation.route, operation.params)]
        : [],
    ),
    unroutable: coverage.unroutable,
  };
}
