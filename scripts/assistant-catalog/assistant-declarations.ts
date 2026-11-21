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

export interface Declaration {
  name: string;
  node: FunctionNode;
  body: ts.Node;
  docs: ts.Node[];
  substitutions: Map<string, ts.Expression>;
}

export interface FileSurface {
  declarations: Declaration[];
  helpers: Map<string, PathHelper>;
  wrappers: Map<string, TransportWrapper>;
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

const PLUMBING_TYPES = new Set([
  "AdapterContext",
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
