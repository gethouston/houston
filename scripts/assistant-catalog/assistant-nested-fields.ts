import type {
  AssistantFieldDocument,
  AssistantRoute,
  JsonSchema,
} from "./assistant-catalog-types.ts";
import { entityRuleForNames } from "./assistant-entity-sources.ts";

function objectSchema(schema: JsonSchema): JsonSchema | undefined {
  if (schema.type === "object" && schema.properties) return schema;
  if (schema.type === "array") {
    const items = schema.items;
    return isSchema(items) ? objectSchema(items) : undefined;
  }
  const branches = schema.anyOf;
  if (!Array.isArray(branches)) return undefined;
  for (const branch of branches) {
    if (!isSchema(branch)) continue;
    const found = objectSchema(branch);
    if (found) return found;
  }
  return undefined;
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null;
}

export function nestedFieldsFor(
  parameter: string,
  schema: JsonSchema,
  route: AssistantRoute | null,
  operation: string,
): AssistantFieldDocument[] {
  const object = objectSchema(schema);
  const properties = object?.properties;
  if (!isSchema(properties)) return [];
  const fields: AssistantFieldDocument[] = [];
  for (const name of Object.keys(properties).sort()) {
    const rule = entityRuleForNames(
      [`${parameter}.${name}`, name],
      route?.path ?? "",
    );
    if (!rule?.collection && !rule?.unlisted) continue;
    fields.push({
      name,
      ...(rule.collection ? { resolver: rule.collection } : {}),
      ...(rule.unlisted ? { unresolved: rule.unlisted } : {}),
      ...(rule.discovery && rule.discovery !== operation
        ? { source: rule.discovery }
        : {}),
    });
  }
  return fields;
}
