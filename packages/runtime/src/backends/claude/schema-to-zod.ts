import type { TSchema } from "typebox";
import { z } from "zod";

interface JsonSchemaNode {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  patternProperties?: Record<string, JsonSchemaNode>;
  anyOf?: JsonSchemaNode[];
  const?: unknown;
  enum?: unknown[];
}

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

function toZodType(node: JsonSchemaNode): z.ZodType {
  const built = baseZodType(node);
  return node.description ? built.describe(node.description) : built;
}

function baseZodType(node: JsonSchemaNode): z.ZodType {
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
      const patternValue = node.patternProperties
        ? Object.values(node.patternProperties)[0]
        : undefined;
      return z.record(
        z.string(),
        patternValue ? toZodType(patternValue) : z.unknown(),
      );
    }
    default:
      return z.unknown();
  }
}
