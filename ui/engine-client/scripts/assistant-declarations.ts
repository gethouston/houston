import ts from "typescript";
import { arrowExpressionBody, calleeName } from "./assistant-ast.ts";
import type { PathHelper } from "./assistant-path-parts.ts";

/**
 * The functions that put a request on the wire. Both take `(scope, path,
 * init?)` — the web adapter's control-plane transport and the SDK's own REST
 * seam — so one set of rules reads both surfaces.
 */
export const TRANSPORTS: ReadonlySet<string> = new Set([
  "cpFetch",
  "httpRequest",
]);

/** An operation candidate: an exported module function or a public method. */
export interface Declaration {
  name: string;
  node: ts.FunctionDeclaration | ts.MethodDeclaration;
  body: ts.Block;
}

/**
 * A private helper that wraps a transport: it builds the path from its
 * own parameters and forwards its caller's request options untouched, so a
 * method calling it makes exactly one request through it.
 */
export interface TransportWrapper extends PathHelper {
  /** The wrapper parameter carrying the caller's request options, if any. */
  initParameter: number | null;
}

export interface FileSurface {
  declarations: Declaration[];
  helpers: Map<string, PathHelper>;
  wrappers: Map<string, TransportWrapper>;
}

/** Every direct transport call in a body, at any nesting. */
export function transportCalls(body: ts.Node): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      if (callee !== null && TRANSPORTS.has(callee)) calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return calls;
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

function parameterNames(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
): string[] | null {
  const names: string[] = [];
  for (const parameter of parameters) {
    if (!ts.isIdentifier(parameter.name)) return null;
    names.push(parameter.name.text);
  }
  return names;
}

/**
 * The wrapper a declaration is, or `null`. It qualifies only when its single
 * transport call receives request options it did not build itself — a bare
 * parameter it passes straight through — so nothing about the caller's request
 * is lost.
 */
function asWrapper(
  node: ts.FunctionDeclaration | ts.MethodDeclaration,
  body: ts.Block,
): TransportWrapper | null {
  const calls = transportCalls(body);
  if (calls.length !== 1) return null;
  const [, path, init] = calls[0].arguments;
  const parameters = parameterNames(node.parameters);
  if (!path || !parameters) return null;
  let initParameter: number | null = null;
  if (init) {
    if (!ts.isIdentifier(init)) return null;
    initParameter = parameters.indexOf(init.text);
    if (initParameter < 0) return null;
  }
  return { parameters, template: path, initParameter };
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
export function readFileSurface(source: ts.SourceFile): FileSurface {
  const declarations: Declaration[] = [];
  const helpers = new Map<string, PathHelper>();
  const wrappers = new Map<string, TransportWrapper>();

  const record = (
    node: ts.FunctionDeclaration | ts.MethodDeclaration,
    name: string,
    published: boolean,
  ): void => {
    if (!node.body) return;
    if (published) {
      declarations.push({ name, node, body: node.body });
      return;
    }
    const wrapper = asWrapper(node, node.body);
    if (wrapper) wrappers.set(name, wrapper);
  };

  const visit = (node: ts.Node): void => {
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
      record(
        node,
        node.name.text,
        hasModifier(node, ts.SyntaxKind.ExportKeyword),
      );
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      record(node, node.name.text, isPublicMethod(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { declarations, helpers, wrappers };
}
