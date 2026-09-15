import ts from "typescript";
import { isBareCall, namedValue, stringLiteralText } from "./assistant-ast.ts";
import type { AssistantRoute } from "./assistant-catalog-types.ts";
import type { ClientHop } from "./assistant-client-hop.ts";
import { requesterCall } from "./assistant-client-hop.ts";
import type { Declaration } from "./assistant-declarations.ts";
import { resolvePath } from "./assistant-path-parts.ts";
import { extractInit, toPathTemplate } from "./assistant-route-args.ts";
import {
  type Binding,
  localInitializers,
  type ValueScope,
} from "./assistant-value-scope.ts";

/**
 * The route of a request made through a `@houston/runtime-client` sub-client.
 *
 * The path and verb live in the client method; the values live in the SDK
 * method's parameters. So the client method is read with the caller's
 * arguments bound to its own parameters, and the prefix its client is rooted
 * at is prepended to whatever literal it builds.
 *
 * The client's literals were not authored against the transport contract the
 * adapter's own call sites follow (`packages/sdk/src/modules/http.ts`), so this
 * side additionally resolves the `const`s they name — the `${COMPOSIO}`
 * provider segment, the `opts?.provider ?? COMPOSIO` default. A value the SDK
 * caller can actually override never collapses to its default; see
 * {@link callerSupplied}.
 */

export type HopRouteResult =
  | { route: AssistantRoute; reason: null; returns: ts.Type | null }
  | { route: null; reason: string; returns: null };

/** Every name a parameter binds: its own, or each one its pattern destructures. */
function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isBindingElement(element) ? boundNames(element.name) : [],
  );
}

/** What each client-method parameter holds, given what the SDK method passed. */
function bindArguments(
  method: ts.MethodDeclaration,
  call: ts.CallExpression,
  parameters: Set<string>,
): Map<string, Binding> {
  const bindings = new Map<string, Binding>();
  // A spread hands over an unknown number of values, so every parameter from
  // there on could have been supplied. Reading one as OMITTED would make the
  // default it guards the only route the request can take, which is exactly the
  // guess `unpinThing` exists to refuse.
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
    // The caller DID pass something nothing static describes: record it under
    // every name it reaches the body as - a DESTRUCTURED parameter binds its
    // fields, and a field left unrecorded reads as one the caller cannot
    // supply, which turns the default it guards into the only possible route.
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
  const parts = resolvePath(inner.arguments[0], {
    ...scope,
    helpers: new Map(),
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
  // The SDK wrapper's declared type describes what IT hands back after
  // publishing to a store or discarding the reply; the route answers what the
  // client method returns, and that is what a caller driving it receives.
  const signature = checker.getSignatureFromDeclaration(hop.method);
  return {
    route: {
      method: init.method,
      path: template.path,
      pathParams: template.pathParams,
      query: template.query,
      body: init.body,
      bodyFields: init.bodyFields,
      // Two bodies stand between the caller and the response; either one doing
      // more than returning the call post-processes what the wire answered.
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
