// `../routes/registry` is the DECLARATION door (define/match/types), never the
// ./all barrel that imports every route module — importing that from here would
// close a cycle through the routes that import this package's catalog.
import { matchPath, type RouteDescriptor } from "../routes/registry";
import type { AssistantCatalog, AssistantRoute } from "./catalog";

/**
 * WHICH catalogued operations THIS host can actually perform.
 *
 * The catalog describes one surface that the local host and the hosted gateway
 * both serve, and roughly a quarter of it exists only on the gateway: spaces,
 * teams, billing, the hosted identity profile. On a desktop those operations
 * are in the assistant's map, in its search results and in its describe output
 * — so the model calls one, the address misses every handler, and the person
 * hears Houston break rather than "that is not something this Houston can do".
 *
 * The answer is derived, never listed: the host's own ROUTE REGISTRY is the
 * record of what it serves, so an operation is unserved exactly when no
 * registered route answers the address it would call. A hand-kept list would
 * be a second source of truth that goes stale the day a route moves.
 *
 * The semantics are deliberately "the address resolves to a declared handler",
 * not "the capability behind it is wired" — the same line the parity suite's
 * `serviceState` probes already draw. A family that declines a request at
 * runtime (an unwired manager, a slug its grammar does not know) still SERVES
 * the address, and its own answer is a better one than a blanket refusal.
 */

/**
 * Operations a family answers from an `owns` boundary rather than from a
 * declared member, so `listRoutes()` publishes no descriptor for the pair even
 * though the address resolves to a live handler.
 *
 * `triggerTypes` is `GET /v1/integrations/composio/trigger-types`.
 * routes/integrations.ts owns the whole `/v1/integrations/*rest` subtree for
 * every method and dispatches the tail to the provider adapter, which is what
 * answers this one — but `owns` entries widen the MATCHER only; the family
 * publishes descriptors for its enumerated members alone (registry/define.ts).
 * So the route table is silent about a pair the host genuinely serves, and
 * calling it unserved would withdraw a working operation from the assistant.
 *
 * Written out here, one name at a time, rather than by loosening the match:
 * matching `owns` patterns would make every unenumerated address under a
 * claimed subtree read as served, which is the opposite mistake and a much
 * quieter one.
 */
const SERVED_FROM_AN_OWNED_SUBTREE: ReadonlySet<string> = new Set([
  "triggerTypes",
]);

/** A stand-in for one `segment` path parameter: one segment, always present. */
const SEGMENT_VALUE = "houston-probe";
/** A stand-in for one `path` parameter, whose separators survive into the URL. */
const PATH_VALUE = "houston-probe/file";

/**
 * A concrete path for one catalog route: `segment` params become one segment,
 * `path` params two.
 *
 * Matching is STRUCTURAL because the two sides name their parameters
 * differently — the catalog spells `{id}` where the registry spells
 * `:routineId`, `{agentPath}` where it spells `:agentId` — so comparing the
 * patterns as strings would report every parameterised route as unserved.
 */
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

/** True when some registered route answers this operation's method and address. */
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

/**
 * Catalog operations whose route no registered host route answers, sorted by
 * name.
 *
 * Every routable operation is considered, hidden ones included: whether the
 * assistant may call one is a policy question, and this answers a different
 * one — whether the address exists here at all. An operation the generator
 * could not route (`route: null`) is already refused as
 * `operation_not_supported` and is not this gate's business.
 */
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
