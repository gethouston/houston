import { clipSchemaText, schemaType } from "./integrations-schema";
import { schemaNode, schemaParameters } from "./integrations-schema-node";

/** Spend on complete parameter types and enum values before descriptions. */
export function parameterDetails(schema: unknown, budget: number): string {
  const parameters = schemaParameters(schemaNode(schema));
  for (const enumLimit of [Infinity, 12]) {
    for (const descriptionLimit of [150, 100, 60, 30, 0]) {
      const text = parameters
        .map(({ name, spec, required }) => {
          const description =
            descriptionLimit && typeof spec.description === "string"
              ? `; ${clipSchemaText(spec.description.replace(/\s+/g, " "), descriptionLimit)}`
              : "";
          const fallback =
            descriptionLimit && "default" in spec
              ? ` (default: ${clipSchemaText(JSON.stringify(spec.default), 80)})`
              : "";
          return `\n    ${name}${required ? "" : "?"}: ${schemaType(spec, enumLimit)}${description}${fallback}`;
        })
        .join("");
      if (text.length <= budget) return text;
    }
  }
  // Pathological schemas still expose as many complete parameter lines as fit.
  let text = "";
  for (const { name, spec, required } of parameters) {
    const line = `\n    ${name}${required ? "" : "?"}: ${schemaType(spec)}`;
    if (text.length + line.length + 20 > budget) break;
    text += line;
  }
  return text ? `${text}\n    [details cut]` : "";
}
