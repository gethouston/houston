import ts from "typescript";
import { calleeName, unwrap } from "./assistant-ast.ts";
import {
  argumentsOf,
  type FunctionNode,
  isFunctionNode,
  localBinding,
  returnedObject,
} from "./assistant-module-locals.ts";

/**
 * The SDK's published surface, read the way a caller reaches it.
 *
 * An SDK module is a factory closure: `createIntegrationsModule(ctx)` returns
 * the object mounted at `sdk.integrations`, and its methods are plain closures
 * with no exported name of their own. So the operations are found by walking
 * the facade — `packages/sdk/src/sdk.ts` says which factory each property
 * holds — and then the object each factory returns, following a nested object
 * (`writes`), a sub-factory call (`createProviderWrites(ctx)`) and a
 * destructured member (`const { send } = operations`) alike. An operation is
 * named by the path a caller types: `integrations.writes.disconnect`,
 * `preferences.setLocale`.
 *
 * A factory reached this way is WIRING, never an operation: attributing the
 * requests of everything it assembles to the one name that assembles them
 * would describe a call nobody can make. Which functions those are falls out
 * of the walk itself ({@link Surface.wiring}), so nothing has to be listed.
 */

/** A function the walk may descend into, with the file it was read from. */
export interface Candidate {
  node: FunctionNode;
  source: ts.SourceFile;
}

export interface PublishedMember extends Candidate {
  /** The dotted path a caller reaches it by, e.g. `integrations.writes.disconnect`. */
  path: string;
  /** Nodes whose leading JSDoc may document the member, nearest first. */
  docs: ts.Node[];
  /**
   * What the factory enclosing this member was CALLED with, by parameter name.
   * A sub-factory takes the collaborators the module built — the engine client
   * among them — so a member of it reads them as its own parameters, and only
   * the call site says what they hold.
   */
  substitutions: Map<string, ts.Expression>;
}

/** The walk crosses a module, its sub-factories and one destructure; bound it. */
const MAX_DEPTH = 8;

export interface Walk {
  /** Every factory candidate across the SDK sources, by exported name. */
  factories: Map<string, Candidate>;
  wiring: Set<ts.Node>;
}

/** The member values an object literal publishes, in source order. */
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

/**
 * Every function a value publishes, by its dotted path beneath it. A function
 * publishes itself (path `""`); an object publishes its members; a factory
 * call publishes what the factory returns; an identifier publishes whatever it
 * is bound to in the enclosing factory.
 */
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
