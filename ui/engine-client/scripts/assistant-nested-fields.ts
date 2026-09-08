import type {
  AssistantFieldDocument,
  AssistantRoute,
  JsonSchema,
} from "./assistant-catalog-types.ts";
import { entityRuleForNames } from "./assistant-entity-sources.ts";

/**
 * The identifiers a body object carries ONE level in.
 *
 * A parameter typed as an object hides everything about its contents from a
 * reader: `setAgentModelChoice` takes a `choice` holding a provider and a
 * model, `putSkillsManifest` a manifest holding a list of skill names, and to
 * anything reading only the top level those are free strings to invent - the
 * exact shape of the guessing this catalog exists to end. So the walk goes one
 * step in and declares what it finds, using the SAME table the top level reads
 * (`assistant-entity-rules.ts`).
 *
 * DECLARED, never guessed. A field is claimed only when a rule names it (as
 * `<parameter>.<field>` or bare); the top level's spelling heuristic is
 * deliberately not applied here, because a creation payload is full of
 * `slug`/`id` fields that name something being MADE, not something to look up.
 */

/** The object a parameter carries: itself, its array items, or a union branch. */
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

/**
 * Every declared identifier inside `schema`, in property order. Empty for a
 * parameter that carries none - which is most of them, so the field list is
 * omitted from the document rather than written as `[]`.
 */
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
