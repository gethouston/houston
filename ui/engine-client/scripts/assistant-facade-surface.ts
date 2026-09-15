import ts from "typescript";
import { calleeName, unwrap } from "./assistant-ast.ts";
import { returnedObject } from "./assistant-module-locals.ts";
import {
  type Candidate,
  objectMembers,
  type PublishedMember,
  type Walk,
} from "./assistant-module-surface.ts";

/**
 * The SDK facade: which module factory is mounted at which namespace, and the
 * namespaced surface that falls out of walking each one.
 */

export interface Surface {
  members: PublishedMember[];
  /** Every factory the walk descended into — wiring, not operations. */
  wiring: Set<ts.Node>;
}

/**
 * The SDK facade, property by property: `this.integrations =
 * createIntegrationsModule(ctx)` in the `HoustonSdk` constructor. The property
 * name is the namespace every operation the factory publishes is dispatched
 * under, which is why it comes from the facade and not from a directory name.
 */
function facadeModules(
  facade: ts.SourceFile,
): { namespace: string; factory: string }[] {
  const found: { namespace: string; factory: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
      ts.isCallExpression(unwrap(node.right))
    ) {
      const factory = calleeName(unwrap(node.right) as ts.CallExpression);
      if (factory) found.push({ namespace: node.left.name.text, factory });
    }
    ts.forEachChild(node, visit);
  };
  visit(facade);
  return found;
}

/** Every operation the SDK facade publishes, namespaced, in facade order. */
export function facadeSurface(
  facade: ts.SourceFile,
  factories: Map<string, Candidate>,
): Surface {
  const walk: Walk = { factories, wiring: new Set() };
  const members = facadeModules(facade).flatMap(({ namespace, factory }) => {
    const candidate = factories.get(factory);
    const object = candidate ? returnedObject(candidate.node) : null;
    if (!candidate || !object) return [];
    walk.wiring.add(candidate.node);
    return objectMembers(object, candidate, walk, 0, new Map()).map(
      (member) => ({
        ...member,
        path: `${namespace}.${member.path}`,
      }),
    );
  });
  return { members, wiring: walk.wiring };
}
