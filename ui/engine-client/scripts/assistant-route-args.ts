import ts from "typescript";
import { isUndefined, unwrap } from "./assistant-ast.ts";
import type {
  AssistantPathParam,
  HttpMethod,
  PathEncoding,
} from "./assistant-catalog-types.ts";
import {
  type BodyParts,
  extractBody,
  isJsonContentType,
} from "./assistant-route-body.ts";
import type { PathPart, ValueScope } from "./assistant-value-scope.ts";

export interface PathTemplate {
  path: string;
  pathParams: AssistantPathParam[];
  query: Record<string, string>;
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

/** `key={param}` and nothing else — a query value must be one whole parameter.
 *  A key the source sends CONDITIONALLY never reaches this pattern; it arrives
 *  as a `query` path part (./assistant-query-params.ts). */
const QUERY_PAIR = /^([^=&{}]+)=\{([^{}]+)\}$/;

/**
 * Fold resolved parts into the catalog's route shape: a `{param}` template,
 * the path parameters in the order they appear, and the query keys the source
 * spelled into the template.
 */
export function toPathTemplate(parts: PathPart[]): PathTemplate | string {
  const encodings = new Map<string, PathEncoding>();
  const query: Record<string, string> = {};
  let rendered = "";
  for (const part of parts) {
    if (part.kind === "text") {
      if (/[{}]/.test(part.text)) return "literal braces in the path";
      rendered += part.text;
      continue;
    }
    // An optional key contributes no text: the dispatcher adds it only when
    // the parameter behind it arrives.
    if (part.kind === "query") {
      query[part.key] = part.name;
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
 * The verb and body of a request's init object. Only `method`, `body`,
 * `signal` and a JSON-content-type `headers` may appear — the last two never
 * reach the wire shape, and any other key (or a spread) means the request is
 * assembled conditionally, which no static route can honestly describe.
 */
export function extractInit(
  expression: ts.Expression | undefined,
  scope: ValueScope,
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
    if (key === "headers") {
      if (!isJsonContentType(property.initializer, scope))
        return "request headers carry more than the JSON content type";
      continue;
    }
    if (key !== "body") return `unsupported request option ${key}`;
    const parts = extractBody(property.initializer, scope);
    if (typeof parts === "string") return parts;
    body = parts;
  }
  return { method, ...body };
}
