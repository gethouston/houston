import ts from "typescript";
import { calleeName, isUndefined, unwrap } from "./assistant-ast.ts";
import type {
  AssistantPathParam,
  HttpMethod,
  PathEncoding,
} from "./assistant-catalog-types.ts";
import type { PathPart } from "./assistant-path-parts.ts";

export interface PathTemplate {
  path: string;
  pathParams: AssistantPathParam[];
  query: Record<string, string>;
}

export interface BodyParts {
  body: string | null;
  bodyFields: Record<string, string> | null;
}

export interface InitParts extends BodyParts {
  method: HttpMethod;
}

const httpMethods: readonly HttpMethod[] = [
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
];

/** `key={param}` and nothing else — a query value must be one whole parameter. */
const QUERY_PAIR = /^([^=&{}]+)=\{([^{}]+)\}$/;

/**
 * Fold resolved parts into the catalog's route shape: a `{param}` template,
 * the path parameters in the order they appear, and the query keys the source
 * spelled into the template.
 */
export function toPathTemplate(parts: PathPart[]): PathTemplate | string {
  const encodings = new Map<string, PathEncoding>();
  let rendered = "";
  for (const part of parts) {
    if (part.kind === "text") {
      if (/[{}]/.test(part.text)) return "literal braces in the path";
      rendered += part.text;
      continue;
    }
    const known = encodings.get(part.name);
    if (known && known !== part.encoding)
      return `"${part.name}" is escaped two different ways`;
    encodings.set(part.name, part.encoding);
    rendered += `{${part.name}}`;
  }
  const mark = rendered.indexOf("?");
  const path = mark < 0 ? rendered : rendered.slice(0, mark);
  const pathParams: AssistantPathParam[] = [];
  for (const [, name] of path.matchAll(/\{([^{}]+)\}/g)) {
    const encoding = encodings.get(name);
    if (encoding && !pathParams.some((param) => param.name === name))
      pathParams.push({ name, encoding });
  }
  const query: Record<string, string> = {};
  if (mark >= 0) {
    for (const pair of rendered.slice(mark + 1).split("&")) {
      const match = QUERY_PAIR.exec(pair);
      if (!match) return "query string is not a plain key=parameter list";
      query[match[1]] = match[2];
    }
  }
  return { path, pathParams, query };
}

/**
 * The parameter a body value reads: the parameter itself (`name`), or one of
 * its fields reached by plain (or optional) property access — `seed?.claudeMd`
 * reads as `"seed.claudeMd"`. Anything computed resolves to `null`.
 */
function parameterReference(
  expression: ts.Expression,
  parameters: Set<string>,
): string | null {
  const keys: string[] = [];
  let node = unwrap(expression);
  while (ts.isPropertyAccessExpression(node)) {
    keys.unshift(node.name.text);
    node = unwrap(node.expression);
  }
  if (!ts.isIdentifier(node) || !parameters.has(node.text)) return null;
  return [node.text, ...keys].join(".");
}

/** `{ key: param, key: param.field, shorthandParam }` — every value must read
 *  a parameter. */
function identifierMap(
  expression: ts.ObjectLiteralExpression,
  parameters: Set<string>,
): Record<string, string> | string {
  const map: Record<string, string> = {};
  for (const property of expression.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      if (!parameters.has(property.name.text))
        return "body value is not a parameter";
      map[property.name.text] = property.name.text;
      continue;
    }
    if (!ts.isPropertyAssignment(property)) return "non-assignment body entry";
    const key = ts.isIdentifier(property.name)
      ? property.name.text
      : ts.isStringLiteral(property.name)
        ? property.name.text
        : null;
    if (key === null) return "computed body key";
    const value = parameterReference(property.initializer, parameters);
    if (value === null) return "body value is not a parameter";
    map[key] = value;
  }
  return map;
}

/** The JSON body of one `body:` property: `JSON.stringify(…)` or a raw string
 *  parameter (the pre-serialized credential blobs). */
function extractBody(
  expression: ts.Expression,
  parameters: Set<string>,
): BodyParts | string {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    return parameters.has(node.text)
      ? { body: node.text, bodyFields: null }
      : "body is not a parameter";
  }
  if (!ts.isCallExpression(node) || calleeName(node) !== "stringify")
    return "body is neither JSON.stringify nor a parameter";
  const [argument] = node.arguments;
  if (!argument || node.arguments.length !== 1)
    return "JSON.stringify takes more than the value";
  const value = unwrap(argument);
  if (ts.isObjectLiteralExpression(value)) {
    const bodyFields = identifierMap(value, parameters);
    return typeof bodyFields === "string"
      ? bodyFields
      : { body: null, bodyFields };
  }
  if (!ts.isIdentifier(value)) return "non-identifier body argument";
  return parameters.has(value.text)
    ? { body: value.text, bodyFields: null }
    : "body argument is not a parameter";
}

/**
 * The verb and body of a `cpFetch` init object. Only `method`, `body` and
 * `signal` may appear — `signal` never reaches the wire shape, and any other
 * key (or a spread) means the request is assembled conditionally, which no
 * static route can honestly describe.
 */
export function extractInit(
  expression: ts.Expression | undefined,
  parameters: Set<string>,
): InitParts | string {
  const empty: InitParts = { method: "GET", body: null, bodyFields: null };
  if (!expression) return empty;
  const node = unwrap(expression);
  if (isUndefined(node)) return empty;
  if (!ts.isObjectLiteralExpression(node)) return "non-literal request options";
  let method: HttpMethod = "GET";
  let body: BodyParts = { body: null, bodyFields: null };
  for (const property of node.properties) {
    // `signal` is forwarded plumbing — usually as shorthand — and never
    // reaches the wire shape, so it is skipped before anything else.
    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === "signal"
    )
      continue;
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name))
      return "non-assignment request option";
    const key = property.name.text;
    if (key === "signal") continue;
    if (key === "method") {
      const literal = unwrap(property.initializer);
      if (!ts.isStringLiteral(literal)) return "non-literal HTTP method";
      const known = httpMethods.find((verb) => verb === literal.text);
      if (!known) return `unsupported HTTP method ${literal.text}`;
      method = known;
      continue;
    }
    if (key !== "body") return `unsupported request option ${key}`;
    const parts = extractBody(property.initializer, parameters);
    if (typeof parts === "string") return parts;
    body = parts;
  }
  return { method, ...body };
}
