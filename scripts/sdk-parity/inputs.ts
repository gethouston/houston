import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DESKTOP_NATIVE_COMMANDS } from "../../app/src/lib/desktop-native-commands.ts";
import { listRoutes } from "../../packages/host/src/routes/registry/all.ts";
import type {
  AssistantParameter,
  AssistantRoute,
} from "../assistant-catalog/assistant-catalog-types.ts";
import { extractCatalog } from "../assistant-catalog/assistant-extractor.ts";
import { assistantPaths } from "../assistant-catalog/assistant-paths.ts";
import { type AdapterMethod, classifyAdapter } from "./adapter-methods.ts";
import { routePaths } from "./route-paths.ts";

export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export interface SdkMethod {
  name: string;
  key: string;
  keys: string[];
}

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

export interface DesktopCalls {
  sdk: AdapterMethod[];
  native: string[];
  unbound: AdapterMethod[];
}

function sourcesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourcesUnder(join(directory, entry.name))
      : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
        ? [join(directory, entry.name)]
        : [],
  );
}

export function desktopCalls(): DesktopCalls {
  const methods = classifyAdapter(
    sourcesUnder(resolve(repoRoot, "packages/engine-adapter/src")),
  );
  return {
    sdk: methods.filter((method) => method.bound),
    native: DESKTOP_NATIVE_COMMANDS.map(([command]) => command),
    unbound: methods.filter((method) => method.unbound),
  };
}

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
