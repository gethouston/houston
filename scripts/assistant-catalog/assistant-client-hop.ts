import ts from "typescript";
import { calleeName, unwrap } from "./assistant-ast.ts";
import { clientRoot } from "./assistant-client-root.ts";
import type { PathPart } from "./assistant-value-scope.ts";

const REQUESTERS: ReadonlySet<string> = new Set(["json", "request"]);

export interface HopContext {
  checker: ts.TypeChecker;
  resolvers: ReadonlySet<string>;
  parameters: Set<string>;
  substitutions: Map<string, ts.Expression>;
}

export interface ClientHop {
  method: ts.MethodDeclaration;
  root: PathPart[];
}

export interface Unresolved {
  unresolved: string;
}

export type HopResult = ClientHop | Unresolved | null;

export function isUnresolved(value: object | null): value is Unresolved {
  return value !== null && "unresolved" in value;
}

function resolverMethod(
  call: ts.CallExpression,
  context: HopContext,
): ts.MethodDeclaration | null {
  const callee = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const type = context.checker.getTypeAtLocation(callee.expression);
  const property = context.checker.getPropertyOfType(type, callee.name.text);
  const declaration = property?.getDeclarations()?.[0];
  if (!declaration || !ts.isMethodDeclaration(declaration)) return null;
  return context.resolvers.has(declaration.getSourceFile().fileName)
    ? declaration
    : null;
}

function hopName(method: ts.MethodDeclaration): string {
  const owner = method.parent;
  const client =
    (ts.isClassDeclaration(owner) || ts.isClassExpression(owner)) && owner.name
      ? owner.name.text
      : "the client";
  return `${client}.${method.name.getText(method.getSourceFile())}`;
}

export function clientHop(
  call: ts.CallExpression,
  context: HopContext,
): HopResult {
  const method = resolverMethod(call, context);
  if (!method) return null;
  const callee = unwrap(call.expression) as ts.PropertyAccessExpression;
  const root = clientRoot(callee.expression, context);
  if (root === null) return null;
  if (isUnresolved(root))
    return {
      unresolved: `hop into ${hopName(method)} could not be resolved: ${root.unresolved}`,
    };
  return { method, root };
}

export function requesterCall(
  method: ts.MethodDeclaration,
): ts.CallExpression | string {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const name = calleeName(node);
      if (
        name !== null &&
        REQUESTERS.has(name) &&
        ts.isPropertyAccessExpression(callee) &&
        rootsAtThis(callee.expression)
      )
        calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  if (method.body) visit(method.body);
  const [only, ...rest] = calls;
  if (!only) return "the client method issues no request";
  if (rest.length > 0) return "the client method issues several requests";
  return only;
}

function rootsAtThis(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  if (node.kind === ts.SyntaxKind.ThisKeyword) return true;
  return ts.isPropertyAccessExpression(node) && rootsAtThis(node.expression);
}
