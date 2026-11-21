import ts from "typescript";
import { calleeName, unwrap } from "./assistant-ast.ts";
import {
  argumentsOf,
  type FunctionNode,
  isFunctionNode,
  localBinding,
  returnedObject,
} from "./assistant-module-locals.ts";

export interface Candidate {
  node: FunctionNode;
  source: ts.SourceFile;
}

export interface PublishedMember extends Candidate {
  path: string;
  docs: ts.Node[];
  substitutions: Map<string, ts.Expression>;
}

const MAX_DEPTH = 8;

export interface Walk {
  factories: Map<string, Candidate>;
  wiring: Set<ts.Node>;
}

export function objectMembers(
  object: ts.ObjectLiteralExpression,
  scope: Candidate,
  walk: Walk,
  depth: number,
  subs: Map<string, ts.Expression>,
): PublishedMember[] {
  const found: PublishedMember[] = [];
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      found.push(
        ...publishedBy(property.expression, scope, walk, depth + 1, subs),
      );
      continue;
    }
    const name = property.name;
    const key =
      ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
    if (key === null) continue;
    const value = ts.isMethodDeclaration(property)
      ? property
      : ts.isPropertyAssignment(property)
        ? property.initializer
        : ts.isShorthandPropertyAssignment(property)
          ? property.name
          : null;
    if (!value) continue;
    for (const member of publishedBy(value, scope, walk, depth + 1, subs))
      found.push({
        ...member,
        path: member.path ? `${key}.${member.path}` : key,
        docs: [property, ...member.docs],
      });
  }
  return found;
}

function publishedBy(
  value: ts.Node,
  scope: Candidate,
  walk: Walk,
  depth: number,
  subs: Map<string, ts.Expression>,
): PublishedMember[] {
  if (depth > MAX_DEPTH) return [];
  const node = ts.isExpression(value) ? unwrap(value) : value;
  if (isFunctionNode(node))
    return [
      {
        path: "",
        node,
        source: scope.source,
        docs: [node],
        substitutions: subs,
      },
    ];
  if (ts.isObjectLiteralExpression(node))
    return objectMembers(node, scope, walk, depth, subs);
  if (ts.isCallExpression(node)) {
    const name = calleeName(node);
    const factory = name === null ? undefined : walk.factories.get(name);
    const object = factory ? returnedObject(factory.node) : null;
    if (!factory || !object) return [];
    walk.wiring.add(factory.node);
    return objectMembers(
      object,
      factory,
      walk,
      depth,
      argumentsOf(factory.node, node, subs),
    );
  }
  if (!ts.isIdentifier(node)) return [];
  const binding = localBinding(node.text, scope.node);
  if (!binding) return [];
  if (binding.kind === "value") {
    const docs = binding.docs;
    const found = publishedBy(binding.value, scope, walk, depth + 1, subs);
    return docs
      ? found.map((member) => ({ ...member, docs: [...member.docs, docs] }))
      : found;
  }
  return publishedBy(binding.from, scope, walk, depth + 1, subs)
    .filter((member) => member.path === binding.name)
    .map((member) => ({ ...member, path: "" }));
}
