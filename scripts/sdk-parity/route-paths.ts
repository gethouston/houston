import type {
  AssistantParameter,
  AssistantRoute,
  JsonSchema,
} from "../../ui/engine-client/scripts/assistant-catalog-types.ts";

/** The paths one SDK route addresses, parameters closed to a set expanded. */

/**
 * The catalog path with its whole-subtree parameters spelled as such: an SDK
 * parameter escaped per segment keeps its `/`s, so `{relPath}` addresses the
 * same slot the host declares as `*rest`, not one segment of it.
 */
function restSpelled(route: AssistantRoute): string {
  return route.pathParams.reduce(
    (path, param) =>
      param.encoding === "path"
        ? path.replaceAll(`{${param.name}}`, "{...}")
        : path,
    route.path,
  );
}

/**
 * The values a schema closes to, or null when it admits anything else.
 *
 * The extractor spells a union of string literals as an `anyOf` of `const`
 * branches and a generated enum as `enum`, so both are read. One open branch
 * opens the whole union, and a member that is not a string cannot be a path
 * segment — either way the parameter stays a parameter.
 */
function closedMembers(schema: JsonSchema | undefined): string[] | null {
  if (!schema) return null;
  const closed = schema as {
    enum?: unknown;
    const?: unknown;
    anyOf?: unknown;
  };
  if (Array.isArray(closed.enum)) return allStrings(closed.enum);
  if (typeof closed.const === "string") return [closed.const];
  if (!Array.isArray(closed.anyOf)) return null;
  const members: string[] = [];
  for (const branch of closed.anyOf) {
    const inner = closedMembers(branch as JsonSchema);
    if (!inner) return null;
    members.push(...inner);
  }
  return allStrings(members);
}

const allStrings = (values: unknown[]): string[] | null =>
  values.length && values.every((value) => typeof value === "string")
    ? (values as string[])
    : null;

/**
 * Every path an SDK route addresses: the parameterised spelling first, then one
 * concrete spelling per member of a path parameter the catalog closes to a
 * fixed set (`provider: "composio" | "custom"` →
 * `/v1/integrations/composio/connections` and `/v1/integrations/custom/…`).
 *
 * The join key folds every parameter to `{}`, which is right when both sides
 * spell the slot as a parameter and wrong for a server that declares the
 * members literally: the gateway serves `/v1/integrations/composio/connections`
 * while the SDK takes the provider as a closed argument, so the folded key and
 * the literal never meet and a route the SDK plainly reaches reads as unbound.
 * Expanding a CLOSED parameter is the honest join — those are exactly the
 * spellings the SDK issues, and a literal no member names still reports.
 * Nothing folds the other way: a server literal stays literal, because folding
 * it to `{}` would let any literal bind to any parameter.
 */
export function routePaths(
  route: AssistantRoute,
  params: AssistantParameter[],
): [string, ...string[]] {
  const spelled = restSpelled(route);
  const expanded = route.pathParams.reduce<string[]>(
    (paths, param) => {
      const members =
        param.encoding === "segment"
          ? closedMembers(
              params.find((candidate) => candidate.name === param.name)?.schema,
            )
          : null;
      return members
        ? paths.flatMap((path) =>
            members.map((member) => path.replaceAll(`{${param.name}}`, member)),
          )
        : paths;
    },
    [spelled],
  );
  return expanded[0] === spelled
    ? [spelled, ...expanded.slice(1)]
    : [spelled, ...expanded];
}
