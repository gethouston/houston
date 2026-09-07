import ts from "typescript";
import { calleeName, namedValue, unwrap } from "./assistant-ast.ts";
import type { PathEncoding } from "./assistant-catalog-types.ts";

/** One piece of a resolved path template: fixed text, or a parameter slot. */
export type PathPart =
  | { kind: "text"; text: string }
  | { kind: "param"; name: string; encoding: PathEncoding };

/** What a call site binds one helper parameter to. */
export type Binding =
  | { kind: "param"; name: string }
  | { kind: "parts"; parts: PathPart[] };

/** A path-building helper: `const p = (id) => \`/agents/${…}\`` or a private
 *  transport wrapper method whose path argument is such a template. */
export interface PathHelper {
  parameters: string[];
  template: ts.Expression;
}

export interface PathContext {
  /** The operation's own parameter names. */
  parameters: Set<string>;
  /** Helpers visible to the file being extracted. */
  helpers: Map<string, PathHelper>;
  /** Helper parameter -> what its caller passed. Empty at the top level. */
  bindings: Map<string, Binding>;
  depth: number;
}

/** Helpers may nest (a wrapper calling `agentPath`), never without bound. */
const MAX_DEPTH = 4;

const fail = (reason: string): string => reason;

function text(value: string): PathPart[] {
  return value === "" ? [] : [{ kind: "text", text: value }];
}

/**
 * The parameter an expression denotes, following one level of helper binding.
 * A helper parameter bound to fixed text is not a parameter — it is text, and
 * the caller handles that case separately.
 */
function boundParameter(
  expression: ts.Expression,
  context: PathContext,
): string | null {
  const name = namedValue(expression);
  if (name === null) return null;
  const binding = context.bindings.get(name);
  if (binding) return binding.kind === "param" ? binding.name : null;
  return context.parameters.has(name) ? name : null;
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
    // A helper parameter the caller filled with a fixed segment: escaping it
    // is what the source already did to that literal, so it stands as text.
    if (bound?.every((part) => part.kind === "text")) return bound;
    return fail("path segment is not a parameter");
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

/** The parts a bound helper parameter stands for, when it is bound to parts. */
function bindingParts(
  expression: ts.Expression,
  context: PathContext,
): PathPart[] | null {
  const inner = unwrap(expression);
  if (!ts.isIdentifier(inner)) return null;
  const binding = context.bindings.get(inner.text);
  return binding?.kind === "parts" ? binding.parts : null;
}

/**
 * A path expression as an ordered list of parts, or the reason it cannot be
 * derived. Only literals, `encodeURIComponent(param)`, the multi-segment escape
 * idiom, and calls to known path helpers resolve — an unescaped interpolation
 * is refused rather than guessed, because the dispatcher escapes what it
 * substitutes and the two must agree exactly.
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
    return parts ?? fail("unescaped path interpolation");
  }
  if (ts.isCallExpression(node)) return resolveCall(node, context);
  if (!ts.isTemplateExpression(node)) return fail("non-literal path");
  const parts: PathPart[] = [...text(node.head.text)];
  for (const span of node.templateSpans) {
    const resolved = resolvePath(span.expression, context);
    if (typeof resolved === "string") return resolved;
    parts.push(...resolved, ...text(span.literal.text));
  }
  return parts;
}
