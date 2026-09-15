import ts from "typescript";
import { arrowExpressionBody } from "./assistant-ast.ts";
import {
  type FunctionNode,
  returnedObject,
} from "./assistant-module-locals.ts";
import type { PathHelper } from "./assistant-path-parts.ts";
import {
  asWrapper,
  type TransportWrapper,
} from "./assistant-transport-wrapper.ts";

/**
 * An operation candidate: an exported module function, a public method, or one
 * member of the object an SDK module factory publishes.
 */
export interface Declaration {
  name: string;
  node: FunctionNode;
  /** The function body: a block, or a concise arrow's single expression. */
  body: ts.Node;
  /** Nodes whose leading JSDoc may document it, nearest first. */
  docs: ts.Node[];
  /** What the factory publishing it was called with (facade members only). */
  substitutions: Map<string, ts.Expression>;
}

export interface FileSurface {
  declarations: Declaration[];
  helpers: Map<string, PathHelper>;
  wrappers: Map<string, TransportWrapper>;
  /**
   * Exported functions that answer with an object literal — the shape a module
   * factory has. Whether one IS wiring is settled by the facade walk, which
   * needs every candidate in hand before it can tell.
   */
  factories: { name: string; node: FunctionNode }[];
}

function hasModifier(
  node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> },
  kind: ts.SyntaxKind,
): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function isPublicMethod(node: ts.MethodDeclaration): boolean {
  return ![
    ts.SyntaxKind.PrivateKeyword,
    ts.SyntaxKind.ProtectedKeyword,
    ts.SyntaxKind.StaticKeyword,
  ].some((kind) => hasModifier(node, kind));
}

/**
 * A cluster mixin's class factory. It is not an operation: everything it
 * publishes is a method of the class it declares, and treating the factory
 * itself as one would attribute the whole cluster's requests to a single name.
 */
function isMixinFactory(node: ts.FunctionDeclaration): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (ts.isClassDeclaration(child) || ts.isClassExpression(child))
      found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  if (node.body) visit(node.body);
  return found;
}

/** Parameters that are transport plumbing, never something a caller supplies. */
const PLUMBING_TYPES = new Set([
  "ControlPlaneConfig",
  "HttpScope",
  "AbortSignal",
  "AbortSignal | undefined",
]);

export function isPlumbingParameter(
  parameter: ts.ParameterDeclaration,
): boolean {
  const type = parameter.type?.getText().replace(/\s+/g, " ").trim();
  return type !== undefined && PLUMBING_TYPES.has(type);
}

/**
 * Everything one source file contributes: the operations it publishes, the
 * path helpers its templates call, and the private transport wrappers its
 * methods reach the wire through.
 */
export function readFileSurface(
  source: ts.SourceFile,
  isModuleSource: boolean,
): FileSurface {
  const declarations: Declaration[] = [];
  const helpers = new Map<string, PathHelper>();
  const wrappers = new Map<string, TransportWrapper>();
  const factories: { name: string; node: FunctionNode }[] = [];

  const record = (
    node: ts.FunctionDeclaration | ts.MethodDeclaration,
    name: string,
    published: boolean,
  ): void => {
    if (!node.body) return;
    if (published) {
      declarations.push({
        name,
        node,
        body: node.body,
        docs: [node],
        substitutions: new Map(),
      });
      return;
    }
    const wrapper = asWrapper(node, node.body);
    if (wrapper) wrappers.set(name, wrapper);
  };

  const visit = (node: ts.Node, inClass: boolean): void => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const arrow = declaration.initializer
          ? arrowExpressionBody(declaration.initializer)
          : null;
        if (arrow && ts.isIdentifier(declaration.name))
          helpers.set(declaration.name.text, arrow);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && !isMixinFactory(node)) {
      const exported = hasModifier(node, ts.SyntaxKind.ExportKeyword);
      if (isModuleSource && exported && returnedObject(node))
        factories.push({ name: node.name.text, node });
      record(node, node.name.text, exported);
    }
    // A CLASS method is published under its own name; a method written inside
    // an object literal is one member of what a factory returns, and is
    // reached under the facade path that mounts it, never bare.
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && inClass) {
      record(node, node.name.text, isPublicMethod(node));
    }
    const nested =
      ts.isClassDeclaration(node) || ts.isClassExpression(node)
        ? true
        : ts.isObjectLiteralExpression(node)
          ? false
          : inClass;
    ts.forEachChild(node, (child) => visit(child, nested));
  };
  visit(source, false);
  return { declarations, helpers, wrappers, factories };
}
