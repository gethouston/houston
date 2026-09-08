import type { TSchema } from "typebox";

/**
 * Turns a param's JSON Schema into a sentence the model can ACT on.
 *
 * The catalog's schema is the only place a param's accepted values live, so a
 * rejection that says "does not match" and nothing else leaves the model
 * guessing formats: asked for a blue agent it tried "blue", "#0000FF",
 * "0000FF", then deleted and recreated the agent rather than reading the
 * palette. An error that carries the accepted values ends that loop on the
 * first try.
 */

/** The JSON Schema keywords read here — `TSchema` itself is an opaque `{}`. */
interface SchemaFacets {
  const?: unknown;
  enum?: unknown[];
  anyOf?: TSchema[];
  oneOf?: TSchema[];
  type?: unknown;
}

function facets(schema: TSchema): SchemaFacets {
  return schema as SchemaFacets;
}

/** A value's JSON type name, spelled as the schemas spell it. */
export function jsonTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * The exact values a schema accepts (`enum`, `const`, or an `anyOf`/`oneOf` of
 * those — the shape the generator emits for a union of string literals), or
 * null when the schema is not a closed set of choices.
 *
 * A `{ type: "null" }` branch is how an optional param is spelled; it offers no
 * value to choose from, so it is skipped instead of defeating the whole list.
 */
export function acceptedValues(schema: TSchema): string[] | null {
  const facet = facets(schema);
  if (Array.isArray(facet.enum)) return renderChoices(facet.enum);
  if ("const" in facet) return renderChoices([facet.const]);
  const branches = facet.anyOf ?? facet.oneOf;
  if (!branches) return null;
  const values: string[] = [];
  for (const branch of branches) {
    if (isNullBranch(branch)) continue;
    const nested = acceptedValues(branch);
    if (!nested) return null;
    values.push(...nested);
  }
  return values.length ? values : null;
}

/** The JSON types a schema accepts, deduped and in declaration order. */
export function expectedTypes(schema: TSchema): string[] {
  const facet = facets(schema);
  const types = new Set<string>();
  if (typeof facet.type === "string") types.add(facet.type);
  if (Array.isArray(facet.type)) {
    for (const entry of facet.type) {
      if (typeof entry === "string") types.add(entry);
    }
  }
  for (const branch of facet.anyOf ?? facet.oneOf ?? []) {
    for (const type of expectedTypes(branch)) types.add(type);
  }
  return [...types];
}

/**
 * The `invalid_param` message: what the operation would have accepted, what
 * arrived instead, and `houston_describe` only as the fallback for the schemas
 * that cannot be stated in one line.
 */
export function invalidParamMessage(opts: {
  operation: string;
  param: string;
  schema: TSchema;
  value: unknown;
}): string {
  const lead = `The value given for "${opts.param}" does not match what ${opts.operation} accepts.`;
  const hint = "Call houston_describe for its full schema.";
  const given = renderValue(opts.value);
  const values = acceptedValues(opts.schema);
  if (values) {
    return `${lead} "${opts.param}" must be one of: ${values.join(", ")}. You gave ${given}. ${hint}`;
  }
  const types = expectedTypes(opts.schema);
  if (types.length) {
    return `${lead} "${opts.param}" must be of type ${types.join(" or ")}, and you gave ${jsonTypeOf(opts.value)} (${given}). ${hint}`;
  }
  return `${lead} You gave ${jsonTypeOf(opts.value)} (${given}), which does not fit its declared shape. ${hint}`;
}

/** Every choice rendered bare (`navy`, not `"navy"`), or null if any is a structure. */
function renderChoices(values: unknown[]): string[] | null {
  const rendered: string[] = [];
  for (const value of values) {
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return null;
    }
    rendered.push(String(value));
  }
  return rendered.length ? rendered : null;
}

function isNullBranch(schema: TSchema): boolean {
  const facet = facets(schema);
  return (
    facet.type === "null" && !("const" in facet) && facet.enum === undefined
  );
}

/** The rejected value, as JSON, capped so a big blob cannot flood the transcript. */
function renderValue(value: unknown): string {
  if (value === undefined) return "nothing";
  const json = JSON.stringify(value) ?? String(value);
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}
