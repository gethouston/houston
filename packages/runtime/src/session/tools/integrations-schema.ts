import {
  schemaNode,
  schemaObject,
  schemaParameters,
} from "./integrations-schema-node";

export const clipSchemaText = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

/** Receives a depth-bounded, locally resolved schema from schemaNode. */
export function schemaType(
  node: Record<string, unknown>,
  enumLimit = 12,
): string {
  if ("const" in node) return JSON.stringify(node.const);
  if (Array.isArray(node.enum)) {
    const literals = node.enum.filter((v) => v !== null);
    return (
      literals
        .slice(0, enumLimit)
        .map((v) => JSON.stringify(v))
        .join("|") + (literals.length > enumLimit ? "|…" : "") || "any"
    );
  }
  const alternatives = node.anyOf ?? node.oneOf;
  if (Array.isArray(alternatives)) {
    return (
      [
        ...new Set(
          alternatives
            .filter((v) => schemaObject(v)?.type !== "null")
            .map((v) => schemaType(schemaObject(v) ?? {}, enumLimit)),
        ),
      ].join("|") || "any"
    );
  }
  if (Array.isArray(node.type)) {
    return (
      node.type
        .filter((type) => type !== "null")
        .map((type) => schemaType({ ...node, type }, enumLimit))
        .join("|") || "any"
    );
  }
  if (node.type === "array") {
    const itemNode = schemaObject(node.items) ?? {};
    const item = schemaType(itemNode, enumLimit);
    const union =
      itemNode.anyOf ?? itemNode.oneOf ?? itemNode.enum ?? itemNode.type;
    return `${Array.isArray(union) && item.includes("|") ? `(${item})` : item}[]`;
  }
  if (node.type === "object" || node.properties || node.additionalProperties) {
    const parts = schemaParameters(node).map(({ name, spec, required }) => {
      const deprecated =
        spec.deprecated === true ||
        (typeof spec.description === "string" &&
          /^deprecated/i.test(spec.description));
      return `${name}${required ? "" : "?"}${deprecated ? " [deprecated]" : ""}: ${schemaType(spec, enumLimit)}`;
    });
    if (schemaObject(node.additionalProperties)) {
      parts.push(
        `[key: string]: ${schemaType(schemaObject(node.additionalProperties) ?? {}, enumLimit)}`,
      );
    }
    return parts.length ? `{ ${parts.join(", ")} }` : "object";
  }
  return typeof node.type === "string" ? node.type : "any";
}

/** Cut only between complete top-level parameters, never inside a literal. */
export function schemaSignature(schema: unknown): string | null {
  if (!schemaObject(schema)) return null;
  const signature = schemaType(schemaNode(schema));
  const marker = "… [signature cut]";
  if (signature.length <= 700) return signature;
  let depth = 0;
  let quoted = false;
  let end = signature.startsWith("{ ") ? 2 : 0;
  for (let i = 0; i < 700 - marker.length; i++) {
    const char = signature[i];
    if (char === "\\" && quoted) {
      i++;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === "{" || char === "[" || char === "(") depth++;
    if (char === "}" || char === "]" || char === ")") depth--;
    if (char === "," && signature[i + 1] === " " && depth === 1) end = i;
  }
  return signature.slice(0, end) + marker;
}
