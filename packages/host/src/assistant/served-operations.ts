import { matchPath, type RouteDescriptor } from "../routes/registry";
import type { AssistantCatalog, AssistantRoute } from "./catalog";

const SERVED_FROM_AN_OWNED_SUBTREE: ReadonlySet<string> = new Set([
  "triggerTypes",
]);

const SEGMENT_VALUE = "houston-probe";
const PATH_VALUE = "houston-probe/file";

export function operationProbePath(route: AssistantRoute): string {
  let path = route.path;
  for (const { name, encoding } of route.pathParams) {
    path = path.replaceAll(
      `{${name}}`,
      encoding === "path" ? PATH_VALUE : SEGMENT_VALUE,
    );
  }
  return path;
}

function servedBy(
  route: AssistantRoute,
  routes: readonly RouteDescriptor[],
): boolean {
  const path = operationProbePath(route);
  return routes.some(
    (registered) =>
      registered.method === route.method &&
      matchPath(registered.path, path) !== null,
  );
}

export function unservedOperations(
  catalog: AssistantCatalog,
  routes: readonly RouteDescriptor[],
): string[] {
  return catalog.operations
    .filter(
      (op) =>
        op.route !== null &&
        !SERVED_FROM_AN_OWNED_SUBTREE.has(op.name) &&
        !servedBy(op.route, routes),
    )
    .map((op) => op.name)
    .sort();
}
