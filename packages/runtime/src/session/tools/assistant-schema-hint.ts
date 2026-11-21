import type { TSchema } from "typebox";

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

export function jsonTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

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

function renderValue(value: unknown): string {
  if (value === undefined) return "nothing";
  const json = JSON.stringify(value) ?? String(value);
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}
