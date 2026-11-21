import ts from "typescript";
import { isBareCall, namedValue, stringLiteralText } from "./assistant-ast.ts";
import type { AssistantRoute } from "./assistant-catalog-types.ts";
import type { ClientHop } from "./assistant-client-hop.ts";
import { requesterCall } from "./assistant-client-hop.ts";
import type { Declaration } from "./assistant-declarations.ts";
import { resolvePath } from "./assistant-path-parts.ts";
import { searchParamsIn } from "./assistant-query-params.ts";
import { extractInit, toPathTemplate } from "./assistant-route-args.ts";
import {
  type Binding,
  localInitializers,
  type ValueScope,
} from "./assistant-value-scope.ts";

export type HopRouteResult =
  | { route: AssistantRoute; reason: null; returns: ts.Type | null }
  | { route: null; reason: string; returns: null };

function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isBindingElement(element) ? boundNames(element.name) : [],
  );
}

function bindArguments(
  method: ts.MethodDeclaration,
  call: ts.CallExpression,
  parameters: Set<string>,
): Map<string, Binding> {
  const bindings = new Map<string, Binding>();
  const spreadAt = call.arguments.findIndex((argument) =>
    ts.isSpreadElement(argument),
  );
  for (const [index, parameter] of method.parameters.entries()) {
    const argument = call.arguments[index];
    if (spreadAt >= 0 && index >= spreadAt) {
      for (const bound of boundNames(parameter.name))
        bindings.set(bound, { kind: "opaque" });
      continue;
    }
    if (!argument) continue;
    if (ts.isIdentifier(parameter.name)) {
      const name = namedValue(argument);
      const literal = stringLiteralText(argument);
      if (name !== null && parameters.has(name)) {
        bindings.set(parameter.name.text, { kind: "param", name });
        continue;
      }
      if (literal !== null) {
        bindings.set(parameter.name.text, {
          kind: "parts",
          parts: [{ kind: "text", text: literal }],
        });
        continue;
      }
    }
    for (const bound of boundNames(parameter.name))
      bindings.set(bound, { kind: "opaque" });
  }
  return bindings;
}

export function hopRoute(
  declaration: Declaration,
  call: ts.CallExpression,
  hop: ClientHop,
  parameters: Set<string>,
  checker: ts.TypeChecker,
): HopRouteResult {
  const inner = requesterCall(hop.method);
  if (typeof inner === "string")
    return { route: null, reason: inner, returns: null };
  const source = hop.method.getSourceFile();
  const scope: ValueScope = {
    parameters,
    bindings: bindArguments(hop.method, call, parameters),
    locals: localInitializers(hop.method.body ?? hop.method, source),
  };

  const body = hop.method.body ?? hop.method;
  const parts = resolvePath(inner.arguments[0], {
    ...scope,
    helpers: new Map(),
    searchParams: searchParamsIn(body, scope),
    depth: 0,
  });
  if (typeof parts === "string")
    return { route: null, reason: parts, returns: null };
  const template = toPathTemplate([...hop.root, ...parts]);
  if (typeof template === "string")
    return { route: null, reason: template, returns: null };
  const init = extractInit(inner.arguments[1], scope);
  if (typeof init === "string")
    return { route: null, reason: init, returns: null };
  const signature = checker.getSignatureFromDeclaration(hop.method);
  return {
    route: {
      method: init.method,
      path: template.path,
      pathParams: template.pathParams,
      query: template.query,
      body: init.body,
      bodyFields: init.bodyFields,
      rawResponse: !(
        isBareCall(declaration.body, call) &&
        hop.method.body !== undefined &&
        isBareCall(hop.method.body, inner)
      ),
    },
    reason: null,
    returns: signature ? checker.getReturnTypeOfSignature(signature) : null,
  };
}
