import type { AssistantRoute } from "./assistant-catalog-types.ts";
import { ENTITY_SOURCES, type EntityRule } from "./assistant-entity-rules.ts";

/**
 * Reading the entity table (`./assistant-entity-rules.ts`) against one
 * operation's route: what a parameter holds, and where its values come from.
 */

/** The literal segment a `{placeholder}` follows, or null when it opens the path. */
function segmentBefore(path: string, parameter: string): string | null {
  const segments = path.split("/").filter(Boolean);
  const at = segments.indexOf(`{${parameter}}`);
  if (at <= 0) return null;
  const previous = segments[at - 1];
  return previous.startsWith("{") ? null : previous;
}

/** The names a value travels under: its own, plus the body/query key it fills. */
function wireNames(parameter: string, route: AssistantRoute | null): string[] {
  const carried = Object.entries({ ...route?.bodyFields, ...route?.query })
    .filter(([, value]) => value === parameter)
    .map(([key]) => key);
  return [parameter, ...carried];
}

/**
 * What `parameter` holds, or undefined when it is free text.
 *
 * `route` is the operation's own extracted route: a parameter spliced into a
 * path segment is identified by the collection it follows, and one that only
 * reaches the wire in a body or a query string falls back to its name.
 */
export function entityRuleFor(
  parameter: string,
  route: AssistantRoute | null,
): EntityRule | undefined {
  const after = route ? segmentBefore(route.path, parameter) : null;
  const byRoute = after && ENTITY_SOURCES.find((rule) => rule.after === after);
  if (byRoute) return byRoute;
  return entityRuleForNames(wireNames(parameter, route), route?.path ?? "");
}

/**
 * The rule claiming any of `names`, narrowed by the route path. The name-only
 * half of {@link entityRuleFor}, exported because a field INSIDE a body object
 * reaches the wire under no path segment at all: the only evidence about it is
 * what it is called, qualified by the parameter that carries it.
 */
export function entityRuleForNames(
  names: readonly string[],
  path: string,
): EntityRule | undefined {
  return ENTITY_SOURCES.find(
    (rule) =>
      rule.names?.some((name) => names.includes(name)) &&
      (!rule.pathContains || path.includes(rule.pathContains)),
  );
}

/** The operation that lists what `parameter` accepts, or undefined. */
export function entitySourceFor(
  parameter: string,
  route: AssistantRoute | null,
): string | undefined {
  return entityRuleFor(parameter, route)?.discovery;
}

/** A name that spells out an identifier: `id`, `agentId`, `slug`, `toSlug`. */
const IDENTIFIER = /(^|[a-z])(id|ids|slug|slugs)$/i;

/**
 * Whether a parameter names something that already exists - the values a model
 * must never invent. Spelling is one signal; being spliced into a path segment
 * is the other, because a placeholder always addresses one thing.
 */
export function namesEntity(
  parameter: string,
  route: AssistantRoute | null,
): boolean {
  return (
    wireNames(parameter, route).some((name) => IDENTIFIER.test(name)) ||
    (route?.path ?? "").includes(`{${parameter}}`)
  );
}
