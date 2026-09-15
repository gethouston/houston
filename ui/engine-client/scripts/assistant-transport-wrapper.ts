import ts from "typescript";
import { calleeName } from "./assistant-ast.ts";
import type { PathHelper } from "./assistant-path-parts.ts";

/**
 * The transport seam: the functions that put a request on the wire, and the
 * private helpers a module reaches them through.
 */

/**
 * The functions that put a request on the wire. Both take `(scope, path,
 * init?)` — the web adapter's control-plane transport and the SDK's own REST
 * seam — so one set of rules reads both surfaces.
 */
export const TRANSPORTS: ReadonlySet<string> = new Set([
  "cpFetch",
  "httpRequest",
]);

/**
 * A private helper that wraps a transport: it builds the path from its
 * own parameters and forwards its caller's request options untouched, so a
 * method calling it makes exactly one request through it.
 */
export interface TransportWrapper extends PathHelper {
  /** The wrapper parameter carrying the caller's request options, if any. */
  initParameter: number | null;
}

/** Every direct transport call in a body, at any nesting. */
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

/**
 * The wrapper a declaration is, or `null`. It qualifies only when its single
 * transport call receives request options it did not build itself — a bare
 * parameter it passes straight through — so nothing about the caller's request
 * is lost.
 */
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
