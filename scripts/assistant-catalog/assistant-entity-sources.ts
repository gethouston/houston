import type { AssistantRoute } from "./assistant-catalog-types.ts";
import { ENTITY_SOURCES, type EntityRule } from "./assistant-entity-rules.ts";

function segmentBefore(path: string, parameter: string): string | null {
  const segments = path.split("/").filter(Boolean);
  const at = segments.indexOf(`{${parameter}}`);
  if (at <= 0) return null;
  const previous = segments[at - 1];
  return previous.startsWith("{") ? null : previous;
}

function wireNames(parameter: string, route: AssistantRoute | null): string[] {
  const carried = Object.entries({ ...route?.bodyFields, ...route?.query })
    .filter(([, value]) => value === parameter)
    .map(([key]) => key);
  return [parameter, ...carried];
}

export function entityRuleFor(
  parameter: string,
  route: AssistantRoute | null,
): EntityRule | undefined {
  const after = route ? segmentBefore(route.path, parameter) : null;
  const byRoute =
    after &&
    ENTITY_SOURCES.find(
      (rule) =>
        rule.after === after &&
        (!rule.pathContains || (route?.path ?? "").includes(rule.pathContains)),
    );
  if (byRoute) return byRoute;
  return entityRuleForNames(wireNames(parameter, route), route?.path ?? "");
}

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

export function entitySourceFor(
  parameter: string,
  route: AssistantRoute | null,
): string | undefined {
  return entityRuleFor(parameter, route)?.discovery;
}

const IDENTIFIER = /(^|[a-z])(id|ids|slug|slugs)$/i;

export function namesEntity(
  parameter: string,
  route: AssistantRoute | null,
): boolean {
  return (
    wireNames(parameter, route).some((name) => IDENTIFIER.test(name)) ||
    (route?.path ?? "").includes(`{${parameter}}`)
  );
}
