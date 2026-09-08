import type { TSchema } from "typebox";
import { z } from "zod";

// --- typebox (JSON Schema) → zod raw shape --------------------------------
//
// The SDK's in-process MCP requires each tool's `inputSchema` to be a zod raw
// shape (a record of zod validators); it rejects a plain JSON Schema. Houston's
// pi tools carry typebox schemas (which ARE JSON Schema), so the bridge converts
// each tool's typebox params into the equivalent zod raw shape at build time.
// This keeps the pi tool the SINGLE source of truth for the schema — no
// hand-maintained zod duplicate to drift. The converter covers exactly the
// JSON Schema constructs these tools use; an unrecognized node falls back to
// `z.unknown()` rather than silently dropping a field.

/** The JSON-Schema-shaped view of a typebox node the converter reads. */
interface JsonSchemaNode {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  patternProperties?: Record<string, JsonSchemaNode>;
  /** A typebox `Union` of `Literal`s — how every closed set here is spelled. */
  anyOf?: JsonSchemaNode[];
  const?: unknown;
  enum?: unknown[];
}

/** Convert a typebox object schema into a zod raw shape (per-property validators). */
export function toZodShape(schema: TSchema): Record<string, z.ZodType> {
  const node = schema as unknown as JsonSchemaNode;
  const required = new Set(node.required ?? []);
  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(node.properties ?? {})) {
    const built = toZodType(prop);
    shape[key] = required.has(key) ? built : built.optional();
  }
  return shape;
}

/**
 * The string values a node closes over (`const`, `enum`, or an `anyOf` of
 * those), or null when it is not a closed set of strings. Mirrors the pi side's
 * `acceptedValues` (session/tools/assistant-schema-hint.ts) — the two read the
 * SAME schemas and must agree on what a closed set is.
 */
function literalChoices(node: JsonSchemaNode): string[] | null {
  if (Array.isArray(node.enum)) return allStrings(node.enum);
  if ("const" in node) return allStrings([node.const]);
  if (!node.anyOf) return null;
  const values: string[] = [];
  for (const branch of node.anyOf) {
    const nested = literalChoices(branch);
    if (!nested) return null;
    values.push(...nested);
  }
  return values.length ? values : null;
}

function allStrings(values: unknown[]): string[] | null {
  return values.every((v) => typeof v === "string")
    ? (values as string[])
    : null;
}

/** Convert one JSON Schema node into the equivalent zod validator. */
function toZodType(node: JsonSchemaNode): z.ZodType {
  const built = baseZodType(node);
  return node.description ? built.describe(node.description) : built;
}

function baseZodType(node: JsonSchemaNode): z.ZodType {
  // A closed set FIRST: `mode`, and `provider` once providers are connected, are
  // typebox unions of literals (`anyOf` of `const`, no top-level `type`). Read
  // as a bare `type` they would collapse to `z.unknown()` and the Claude backend
  // would accept — and forward — a value the pi backend rejects.
  const choices = literalChoices(node);
  if (choices) return z.enum(choices as [string, ...string[]]);
  switch (node.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(node.items ? toZodType(node.items) : z.unknown());
    case "object": {
      if (node.properties) return z.object(toZodShape(node as TSchema));
      // A typebox `Record` emits `patternProperties` (open string keys) and no
      // `properties`; map it to a zod record over its value schema.
      const patternValue = node.patternProperties
        ? Object.values(node.patternProperties)[0]
        : undefined;
      return z.record(
        z.string(),
        patternValue ? toZodType(patternValue) : z.unknown(),
      );
    }
    default:
      // No `type` (e.g. typebox `Unknown`) → an unconstrained value.
      return z.unknown();
  }
}
