import ts from "typescript";
import { calleeName, stringLiteralText, unwrap } from "./assistant-ast.ts";
import { entriesAfterSet, type QueryEntry } from "./assistant-query-set.ts";
import type { PathPart, ValueScope } from "./assistant-value-scope.ts";

export type QueryAssemblies = ReadonlyMap<string, QueryEntry[] | null>;

interface Assembly {
  entries: QueryEntry[] | null;
}

interface Declared {
  objects: Map<string, Assembly>;
  aliases: Map<string, Assembly>;
}

function receiverName(call: ts.CallExpression): string | null {
  const callee = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const target = unwrap(callee.expression);
  return ts.isIdentifier(target) ? target.text : null;
}

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
        const seeded = (initializer.arguments?.length ?? 0) > 0;
        found.objects.set(node.name.text, { entries: seeded ? null : [] });
      } else if (
        ts.isCallExpression(initializer) &&
        calleeName(initializer) === "toString"
      ) {
        const target = receiverName(initializer);
        const origin = target === null ? undefined : found.objects.get(target);
        if (origin) found.aliases.set(node.name.text, origin);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

function methodOn(node: ts.Identifier): string | null {
  const parent = node.parent;
  return parent &&
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node
    ? parent.name.text
    : null;
}

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
