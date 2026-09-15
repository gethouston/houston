import ts from "typescript";
import { calleeName, stringLiteralText, unwrap } from "./assistant-ast.ts";
import { entriesAfterSet, type QueryEntry } from "./assistant-query-set.ts";
import type { PathPart, ValueScope } from "./assistant-value-scope.ts";

/**
 * The one idiom that builds an OPTIONAL query string:
 *
 * ```ts
 * const q = new URLSearchParams();
 * if (before !== undefined) q.set("before", before.toString());
 * const suffix = q.toString();
 * httpRequest(scope, `/v1/org/audit${suffix ? `?${suffix}` : ""}`);
 * ```
 *
 * A literal template can only spell a key that is ALWAYS sent, so an operation
 * carrying an optional window (`limit`/`before`) had no derivable route at all -
 * and the reads a person asks for in words ("what happened in this space",
 * "what was said in that chat") are exactly the ones that carry one.
 *
 * Nothing about optionality reaches the catalog. A route's `query` maps a key
 * to the parameter supplying it, and the dispatcher already drops a key whose
 * parameter the caller omitted (`packages/host/src/routes/
 * assistant-request-parts.ts`, `buildQuery`) - the same thing the `if` above
 * does, which is why no marker has to be invented for it.
 *
 * Conservative like every other resolver here: a params object handed anywhere
 * else, or seeded with values, makes the whole query undescribable and the
 * operation stays unroutable with that reason rather than a guess.
 */

/**
 * Names that stand for an assembled query string, mapped to the keys they
 * carry - or `null` when the assembly cannot be described. Both the
 * `URLSearchParams` local and any `const` holding its `.toString()` are in
 * here, because the path reads the second and the `.set` calls write the first.
 */
export type QueryAssemblies = ReadonlyMap<string, QueryEntry[] | null>;

/** One assembly, shared by every name that stands for it. */
interface Assembly {
  entries: QueryEntry[] | null;
}

/**
 * The two kinds of name an assembly answers to. The OBJECT may only be written
 * through `.set` and read through `.toString()` - anywhere else it could be
 * seeded, cleared or handed on, and what it carries stops being knowable. The
 * string its `.toString()` produced is under no such rule: it is a value like
 * any other, and the path reads it exactly once.
 */
interface Declared {
  objects: Map<string, Assembly>;
  aliases: Map<string, Assembly>;
}

/** The `URLSearchParams` local a `.set`/`.toString()` receiver names. */
function receiverName(call: ts.CallExpression): string | null {
  const callee = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const target = unwrap(callee.expression);
  return ts.isIdentifier(target) ? target.text : null;
}

/** Every `const x = new URLSearchParams()`, and every `const y = x.toString()`. */
function declaredAssemblies(body: ts.Node): Declared {
  const found: Declared = { objects: new Map(), aliases: new Map() };
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const initializer = unwrap(node.initializer);
      if (
        ts.isNewExpression(initializer) &&
        ts.isIdentifier(initializer.expression) &&
        initializer.expression.text === "URLSearchParams"
      ) {
        // Seeded with values means the keys are not spelled here at all.
        const seeded = (initializer.arguments?.length ?? 0) > 0;
        found.objects.set(node.name.text, { entries: seeded ? null : [] });
      } else if (
        ts.isCallExpression(initializer) &&
        calleeName(initializer) === "toString"
      ) {
        const target = receiverName(initializer);
        const origin = target === null ? undefined : found.objects.get(target);
        // The SAME assembly object, so a `.set` written after the alias still
        // reaches the name the path reads.
        if (origin) found.aliases.set(node.name.text, origin);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/** Whether an identifier is the receiver of `x.<method>(…)`, and which one. */
function methodOn(node: ts.Identifier): string | null {
  const parent = node.parent;
  return parent &&
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node
    ? parent.name.text
    : null;
}

/**
 * The query keys each assembled search-params name carries, given what the
 * operation's caller can actually supply.
 */
export function searchParamsIn(
  body: ts.Node,
  scope: ValueScope,
): QueryAssemblies {
  const declared = declaredAssemblies(body);
  if (declared.objects.size === 0) return new Map();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const assembly = declared.objects.get(node.text);
      const declaring =
        node.parent &&
        ts.isVariableDeclaration(node.parent) &&
        node.parent.name === node;
      const method = methodOn(node);
      // The params object reaching anything but its own declaration, a `.set`
      // or a `.toString()` escaped somewhere else, and what it carries from
      // there is unknowable.
      if (assembly && !declaring && method !== "set" && method !== "toString")
        assembly.entries = null;
    }
    if (ts.isCallExpression(node) && calleeName(node) === "set") {
      const target = receiverName(node);
      const assembly =
        target === null ? undefined : declared.objects.get(target);
      if (assembly && assembly.entries !== null)
        assembly.entries = entriesAfterSet(node, assembly.entries, body, scope);
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return new Map(
    [...declared.objects, ...declared.aliases].map(([name, assembly]) => [
      name,
      assembly.entries,
    ]),
  );
}

/** The assembled query a path expression reads, or `null` for anything else. */
function searchParamsName(
  expression: ts.Expression,
  assemblies: QueryAssemblies,
): string | null {
  const node = unwrap(expression);
  if (ts.isIdentifier(node))
    return assemblies.has(node.text) ? node.text : null;
  if (ts.isCallExpression(node) && calleeName(node) === "toString") {
    const target = receiverName(node);
    return target !== null && assemblies.has(target) ? target : null;
  }
  return null;
}

/**
 * The conditional suffix an assembled query string is spliced with:
 * `${qs ? `?${qs}` : ""}`. It resolves to the keys that query carries, and to
 * nothing at all when it carries none - which is the honest reading, since the
 * source omits the `?` in exactly that case.
 */
export function resolveQuerySuffix(
  node: ts.ConditionalExpression,
  assemblies: QueryAssemblies,
): PathPart[] | string {
  const refuse = "non-literal path";
  if (stringLiteralText(node.whenFalse) !== "") return refuse;
  const name = searchParamsName(node.condition, assemblies);
  if (name === null) return refuse;
  const truthy = unwrap(node.whenTrue);
  if (!ts.isTemplateExpression(truthy) || truthy.head.text !== "?")
    return refuse;
  const [span, ...rest] = truthy.templateSpans;
  // The suffix must be the WHOLE query and nothing beside it, or the template
  // carries text no route can describe.
  if (!span || rest.length > 0 || span.literal.text !== "") return refuse;
  if (searchParamsName(span.expression, assemblies) !== name) return refuse;
  const entries = assemblies.get(name);
  if (!entries)
    return "query string is assembled from values no route can name";
  return entries.map(({ key, name: parameter }) => ({
    kind: "query" as const,
    key,
    name: parameter,
  }));
}
