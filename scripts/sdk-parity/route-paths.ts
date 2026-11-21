import type {
  AssistantParameter,
  AssistantRoute,
  JsonSchema,
} from "../assistant-catalog/assistant-catalog-types.ts";

function restSpelled(route: AssistantRoute): string {
  return route.pathParams.reduce(
    (path, param) =>
      param.encoding === "path"
        ? path.replaceAll(`{${param.name}}`, "{...}")
        : path,
    route.path,
  );
}

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

export const ANY_KEY_PATHS: ReadonlySet<string> = new Set([
  "/v1/preferences/{}",
]);
