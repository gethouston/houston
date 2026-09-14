import ts from "typescript";
import { calleeName, unwrap } from "./assistant-ast.ts";
import {
  type Binding,
  bindingParts,
  boundParameter,
  callerSupplied,
  type PathPart,
  type ValueScope,
} from "./assistant-value-scope.ts";

/** A path-building helper: `const p = (id) => \`/agents/${…}\`` or a private
 *  transport wrapper method whose path argument is such a template. */
export interface PathHelper {
  parameters: string[];
  template: ts.Expression;
}

export interface PathContext extends ValueScope {
  /** Helpers visible to the file being extracted. */
  helpers: Map<string, PathHelper>;
  depth: number;
}

/** Helpers may nest (a wrapper calling `agentPath`), never without bound. */
const MAX_DEPTH = 4;

/**
 * Why a segment that a caller CAN reach still cannot be derived. It survives
 * the escape wrapper around it, because "not a parameter" would read as the
 * opposite of what happened: the value is reachable, and that is the problem.
 */
const CALLER_OVERRIDE =
  "path segment depends on a value the caller may override";

const fail = (reason: string): string => reason;

function text(value: string): PathPart[] {
  return value === "" ? [] : [{ kind: "text", text: value }];
}

/** `relPath.split("/").map(encodeURIComponent).join("/")` — the one idiom that
 *  escapes a MULTI-segment path, keeping its separators. */
function multiSegmentSource(call: ts.CallExpression): ts.Expression | null {
  if (calleeName(call) !== "join") return null;
  const [separator] = call.arguments;
  if (!separator || !ts.isStringLiteral(separator) || separator.text !== "/")
    return null;
  const mapped = unwrap(
    (call.expression as ts.PropertyAccessExpression)
      .expression as ts.Expression,
  );
  if (!ts.isCallExpression(mapped) || calleeName(mapped) !== "map") return null;
  const [encoder] = mapped.arguments;
  if (
    !encoder ||
    !ts.isIdentifier(encoder) ||
    encoder.text !== "encodeURIComponent"
  )
    return null;
  const split = unwrap(
    (mapped.expression as ts.PropertyAccessExpression)
      .expression as ts.Expression,
  );
  if (!ts.isCallExpression(split) || calleeName(split) !== "split") return null;
  const [on] = split.arguments;
  if (!on || !ts.isStringLiteral(on) || on.text !== "/") return null;
  return (split.expression as ts.PropertyAccessExpression).expression;
}

function resolveCall(
  call: ts.CallExpression,
  context: PathContext,
): PathPart[] | string {
  const callee = calleeName(call);
  if (callee === "encodeURIComponent" && call.arguments.length === 1) {
    const argument = call.arguments[0];
    const parameter = boundParameter(argument, context);
    if (parameter !== null)
      return [{ kind: "param", name: parameter, encoding: "segment" }];
    const bound = bindingParts(argument, context);
    // A callee parameter the caller filled with a fixed segment: escaping it
    // is what the source already did to that literal, so it stands as text.
    if (bound?.every((part) => part.kind === "text")) return bound;
    const inner = resolvePath(argument, context);
    if (typeof inner === "string")
      return inner === CALLER_OVERRIDE
        ? inner
        : fail("path segment is not a parameter");
    // An escaped CONSTANT is still one fixed segment — the client's own
    // `${COMPOSIO}` provider slug — so it reads as the text it escapes.
    return inner.every((part) => part.kind === "text")
      ? inner
      : fail("path segment is not a parameter");
  }
  const multi = multiSegmentSource(call);
  if (multi) {
    const parameter = boundParameter(multi, context);
    return parameter === null
      ? fail("path segment is not a parameter")
      : [{ kind: "param", name: parameter, encoding: "path" }];
  }
  const helper = callee === null ? undefined : context.helpers.get(callee);
  if (!helper) return fail("path interpolation is not a known helper");
  if (context.depth >= MAX_DEPTH) return fail("path helpers nest too deeply");
  if (call.arguments.length > helper.parameters.length)
    return fail("path helper called with too many arguments");
  const bindings = new Map<string, Binding>();
  for (const [index, name] of helper.parameters.entries()) {
    // A trailing parameter the caller omitted stays unbound; so does an
    // argument that is not path-shaped (a transport wrapper's request
    // options). Either one is a failure only if the template reads it, and
    // resolving the template is what reports that.
    const argument = call.arguments[index];
    if (!argument) continue;
    const parameter = boundParameter(argument, context);
    if (parameter !== null) {
      bindings.set(name, { kind: "param", name: parameter });
      continue;
    }
    const parts = resolvePath(argument, context);
    if (typeof parts !== "string") bindings.set(name, { kind: "parts", parts });
  }
  return resolvePath(helper.template, {
    ...context,
    bindings,
    depth: context.depth + 1,
  });
}

/**
 * A default the caller cannot override: `opts?.provider ?? "composio"` where
 * the caller passed no `opts` at all. The guarded branch is unreachable from
 * the operation's signature, so the fallback IS the path. The moment the
 * caller supplies that value, nothing static can say which branch runs.
 */
function resolveDefault(
  node: ts.BinaryExpression,
  context: PathContext,
): PathPart[] | string {
  if (node.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken)
    return fail("non-literal path");
  return callerSupplied(node.left, context)
    ? fail(CALLER_OVERRIDE)
    : resolvePath(node.right, context);
}

/**
 * A path expression as an ordered list of parts, or the reason it cannot be
 * derived. Only literals, `const` names the body can read,
 * `encodeURIComponent(param)`, the multi-segment escape idiom,
 * caller-unreachable defaults and calls to known path helpers resolve — an
 * unescaped interpolation is refused rather than guessed, because the
 * dispatcher escapes what it substitutes and the two must agree exactly.
 */
export function resolvePath(
  expression: ts.Expression,
  context: PathContext,
): PathPart[] | string {
  const node = unwrap(expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return text(node.text);
  if (ts.isIdentifier(node)) {
    const parts = bindingParts(node, context);
    if (parts) return parts;
    // A name the caller filled, or the operation's own parameter, is a value —
    // never text — so it must be escaped to reach the path.
    if (context.bindings.has(node.text) || context.parameters.has(node.text))
      return fail("unescaped path interpolation");
    if (context.depth >= MAX_DEPTH) return fail("path locals nest too deeply");
    const local = context.locals(node.text);
    return local
      ? resolvePath(local, { ...context, depth: context.depth + 1 })
      : fail("unescaped path interpolation");
  }
  if (ts.isCallExpression(node)) return resolveCall(node, context);
  if (ts.isBinaryExpression(node)) return resolveDefault(node, context);
  if (!ts.isTemplateExpression(node)) return fail("non-literal path");
  const parts: PathPart[] = [...text(node.head.text)];
  for (const span of node.templateSpans) {
    const resolved = resolvePath(span.expression, context);
    if (typeof resolved === "string") return resolved;
    parts.push(...resolved, ...text(span.literal.text));
  }
  return parts;
}
