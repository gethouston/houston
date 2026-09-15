import ts from "typescript";
import type { JsonSchema } from "./assistant-catalog-types.ts";

const primitiveFlags: Array<[ts.TypeFlags, string]> = [
  [ts.TypeFlags.String, "string"],
  // A template-literal type (`sk-${string}`) and a mapped one
  // (`Uppercase<string>`) ARE strings: they carry no properties of their own,
  // so walking them emits the String prototype as a ~50-property object.
  [ts.TypeFlags.TemplateLiteral, "string"],
  [ts.TypeFlags.StringMapping, "string"],
  [ts.TypeFlags.Number, "number"],
  [ts.TypeFlags.Boolean, "boolean"],
  [ts.TypeFlags.Null, "null"],
  [ts.TypeFlags.Undefined, "null"],
  [ts.TypeFlags.Void, "null"],
  [ts.TypeFlags.BigInt, "integer"],
];

export function fallbackSchema(typeText: string): JsonSchema {
  return { $comment: `unschematized: ${typeText}` };
}

export function isFallback(schema: JsonSchema): boolean {
  if (typeof schema.$comment === "string") return true;
  return Object.values(schema).some((value) => {
    if (Array.isArray(value)) return value.some(isSchemaValueFallback);
    return isSchemaValueFallback(value);
  });
}

function isSchemaValueFallback(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    isFallback(value as Record<string, unknown>)
  );
}

/**
 * A member keyed by a well-known symbol (`Symbol.iterator` on a `Response`,
 * `Symbol.asyncIterator` on a stream). It can never be a JSON property, and its
 * escaped name embeds a per-checker id (`__@iterator@2256`) that changes
 * between runs — emitting it would make the generated catalog differ on every
 * regeneration and leave the drift check flip-flopping.
 */
function isSymbolNamed(property: ts.Symbol): boolean {
  return property.escapedName.toString().startsWith("__@");
}

/**
 * The schema a type carries ON ITS OWN, without reading any property off it, or
 * `null` when it is not a scalar. A type PARAMETER answers through its
 * constraint (`T extends string` is a string to every caller), which is the
 * only thing a caller can rely on.
 */
function scalarSchema(
  checker: ts.TypeChecker,
  type: ts.Type,
  node: ts.Node,
): JsonSchema | null {
  if (type.isStringLiteral()) return { const: type.value, type: "string" };
  if (type.isNumberLiteral()) return { const: type.value, type: "number" };
  if (type.flags & ts.TypeFlags.BooleanLiteral)
    return {
      const:
        checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation) ===
        "true",
      type: "boolean",
    };
  for (const [flag, schemaType] of primitiveFlags)
    if (type.flags & flag) return { type: schemaType };
  if (type.flags & ts.TypeFlags.TypeParameter) {
    const constraint = checker.getBaseConstraintOfType(type);
    return constraint && constraint !== type
      ? scalarSchema(checker, constraint, node)
      : null;
  }
  return null;
}

export function schemaForType(
  checker: ts.TypeChecker,
  type: ts.Type,
  node: ts.Node,
  seen = new Set<ts.Type>(),
): JsonSchema {
  const text = checker.typeToString(
    type,
    node,
    ts.TypeFormatFlags.NoTruncation,
  );
  if (
    type.flags &
    (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)
  ) {
    return fallbackSchema(text);
  }
  const scalar = scalarSchema(checker, type, node);
  if (scalar) return scalar;
  if (type.isUnion()) {
    return {
      anyOf: type.types.map((part) => schemaForType(checker, part, node, seen)),
    };
  }
  // `"a" | "b" | (string & {})` — the widening that keeps literal autocomplete
  // while accepting any string (ProviderId). The intersection IS its scalar
  // constituent; walking its properties would emit the whole String prototype
  // as an object.
  if (type.isIntersection()) {
    for (const part of type.types) {
      const scalarPart = scalarSchema(checker, part, node);
      if (scalarPart) return scalarPart;
    }
  }
  if ((type.aliasSymbol?.name ?? type.getSymbol()?.name) === "Promise") {
    const promised = checker.getTypeArguments(type as ts.TypeReference)[0];
    if (promised) return schemaForType(checker, promised, node, seen);
  }
  if (checker.isArrayType(type)) {
    const item = checker.getTypeArguments(type as ts.TypeReference)[0];
    return {
      type: "array",
      items: item ? schemaForType(checker, item, node, seen) : {},
    };
  }
  if (checker.isTupleType(type)) {
    const items = checker.getTypeArguments(type as ts.TypeReference);
    return {
      type: "array",
      prefixItems: items.map((item) =>
        schemaForType(checker, item, node, seen),
      ),
    };
  }
  if (seen.has(type) || type.getCallSignatures().length > 0)
    return fallbackSchema(text);
  const properties = checker
    .getPropertiesOfType(type)
    .filter((property) => !isSymbolNamed(property))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (properties.length === 0) return fallbackSchema(text);
  const nextSeen = new Set(seen).add(type);
  const schemas: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const property of properties) {
    const declaration =
      property.valueDeclaration ?? property.declarations?.[0] ?? node;
    schemas[property.name] = schemaForType(
      checker,
      checker.getTypeOfSymbolAtLocation(property, declaration),
      declaration,
      nextSeen,
    );
    if (!(property.flags & ts.SymbolFlags.Optional))
      required.push(property.name);
  }
  return {
    type: "object",
    properties: schemas,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}
