/** Schemas are provider data; inspect only the fields needed for model hints. */
export function schemaObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

const MAX_DEPTH = 8;

/** Resolve against the original root; sibling references get separate paths. */
export function schemaNode(
  value: unknown,
  root: unknown = value,
  depth = 0,
  visited: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  const node = schemaObject(value) ?? {};
  if (depth >= MAX_DEPTH) {
    return {
      type:
        node.properties || node.type === "object" || node.$ref
          ? "object"
          : "any",
    };
  }
  if (typeof node.$ref === "string") {
    if (visited.has(node.$ref)) return { type: "object" };
    if (!/^#\/(\$defs|definitions)\//.test(node.$ref)) return {};
    let target = root;
    for (const part of node.$ref.slice(2).split("/")) {
      target =
        schemaObject(target)?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    const resolved = schemaNode(
      target,
      root,
      depth + 1,
      new Set([...visited, node.$ref]),
    );
    return {
      ...resolved,
      ...(typeof node.description === "string"
        ? { description: node.description }
        : {}),
    };
  }
  const child = (spec: unknown) => schemaNode(spec, root, depth + 1, visited);
  const properties = schemaObject(node.properties);
  const normalized: Record<string, unknown> = {
    ...node,
    ...(properties
      ? {
          properties: Object.fromEntries(
            Object.entries(properties).map(([name, spec]) => [
              name,
              child(spec),
            ]),
          ),
        }
      : {}),
    ...(node.items ? { items: child(node.items) } : {}),
    ...(schemaObject(node.additionalProperties)
      ? { additionalProperties: child(node.additionalProperties) }
      : {}),
    ...(Array.isArray(node.anyOf) ? { anyOf: node.anyOf.map(child) } : {}),
    ...(Array.isArray(node.oneOf) ? { oneOf: node.oneOf.map(child) } : {}),
  };
  if (!Array.isArray(node.allOf)) return normalized;
  const members = node.allOf.map(child);
  if (members.length === 1 && !properties && !members[0]?.properties)
    return { ...normalized, ...members[0] };
  const mergedProperties: Record<string, unknown> = {};
  const required = new Set<unknown>();
  for (const member of [...members, normalized]) {
    Object.assign(mergedProperties, schemaObject(member.properties));
    if (Array.isArray(member.required))
      for (const name of member.required) required.add(name);
  }
  return {
    ...normalized,
    properties: mergedProperties,
    required: [...required],
  };
}

export function schemaParameters(node: Record<string, unknown>) {
  const required = new Set(Array.isArray(node.required) ? node.required : []);
  return Object.entries(schemaObject(node.properties) ?? {})
    .sort(([a], [b]) => Number(required.has(b)) - Number(required.has(a)))
    .map(([name, spec]) => ({
      name,
      spec: schemaObject(spec) ?? {},
      required: required.has(name),
    }));
}
