import ts from "typescript";
import { calleeName } from "./assistant-ast.ts";
import type { PathHelper } from "./assistant-path-parts.ts";

export const TRANSPORTS: ReadonlySet<string> = new Set([
  "cpFetch",
  "httpRequest",
]);

export interface TransportWrapper extends PathHelper {
  initParameter: number | null;
}

function transportCalls(body: ts.Node): ts.CallExpression[] {
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

export function asWrapper(
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
