import ts from "typescript";
import { calleeName, unwrap } from "./assistant-ast.ts";
import {
  callerSupplied,
  parameterReference,
  type ValueScope,
} from "./assistant-value-scope.ts";

/**
 * What a request carries besides its path: the JSON body a route sends, and
 * the one header that is plumbing rather than meaning.
 */

export interface BodyParts {
  body: string | null;
  bodyFields: Record<string, string> | null;
}

/**
 * A conditional spread the caller cannot reach: `...(opts?.agent ? { agent } :
 * {})` where the caller passed no `opts`. Nothing it could add is reachable
 * from the operation's signature, so the body is exactly what the rest of the
 * literal spells. A spread the caller CAN reach makes the shape conditional,
 * which no static route describes.
 */
function spreadEntries(
  property: ts.SpreadAssignment,
  scope: ValueScope,
): Record<string, string> | string {
  const node = unwrap(property.expression);
  if (!ts.isConditionalExpression(node)) return "non-assignment body entry";
  if (callerSupplied(node.condition, scope))
    return "body holds a field the caller may add";
  const fallback = unwrap(node.whenFalse);
  if (!ts.isObjectLiteralExpression(fallback))
    return "non-assignment body entry";
  return identifierMap(fallback, scope);
}

/** `{ key: param, key: param.field, shorthandParam }` — every value must read
 *  a parameter. */
function identifierMap(
  expression: ts.ObjectLiteralExpression,
  scope: ValueScope,
): Record<string, string> | string {
  const map: Record<string, string> = {};
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) {
      const entries = spreadEntries(property, scope);
      if (typeof entries === "string") return entries;
      Object.assign(map, entries);
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      const value = parameterReference(property.name, scope);
      if (value === null) return "body value is not a parameter";
      map[property.name.text] = value;
      continue;
    }
    if (!ts.isPropertyAssignment(property)) return "non-assignment body entry";
    const key = ts.isIdentifier(property.name)
      ? property.name.text
      : ts.isStringLiteral(property.name)
        ? property.name.text
        : null;
    if (key === null) return "computed body key";
    const value = parameterReference(property.initializer, scope);
    if (value === null) return "body value is not a parameter";
    map[key] = value;
  }
  return map;
}

/** The JSON body of one `body:` property: `JSON.stringify(…)` or a raw string
 *  parameter (the pre-serialized credential blobs). */
export function extractBody(
  expression: ts.Expression,
  scope: ValueScope,
): BodyParts | string {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    const body = parameterReference(node, scope);
    return body === null
      ? "body is not a parameter"
      : { body, bodyFields: null };
  }
  if (!ts.isCallExpression(node) || calleeName(node) !== "stringify")
    return "body is neither JSON.stringify nor a parameter";
  const [argument] = node.arguments;
  if (!argument || node.arguments.length !== 1)
    return "JSON.stringify takes more than the value";
  const value = unwrap(argument);
  if (ts.isObjectLiteralExpression(value)) {
    const bodyFields = identifierMap(value, scope);
    return typeof bodyFields === "string"
      ? bodyFields
      : { body: null, bodyFields };
  }
  if (!ts.isIdentifier(value)) return "non-identifier body argument";
  const body = parameterReference(value, scope);
  return body === null
    ? "body argument is not a parameter"
    : { body, bodyFields: null };
}

/**
 * The one header a route may carry: the JSON content type the transport would
 * set anyway. It names no part of the wire shape, so it is plumbing — anything
 * else in `headers` carries meaning the catalog cannot describe.
 */
export function isJsonContentType(
  expression: ts.Expression,
  scope: ValueScope,
): boolean {
  const node = unwrap(expression);
  const literal = ts.isIdentifier(node)
    ? (scope.locals(node.text) ?? node)
    : node;
  const object = unwrap(literal);
  if (!ts.isObjectLiteralExpression(object)) return false;
  return object.properties.every((property) => {
    if (!ts.isPropertyAssignment(property)) return false;
    const key = ts.isStringLiteral(property.name)
      ? property.name.text
      : ts.isIdentifier(property.name)
        ? property.name.text
        : null;
    const value = unwrap(property.initializer);
    return (
      key === "Content-Type" &&
      ts.isStringLiteral(value) &&
      value.text === "application/json"
    );
  });
}
