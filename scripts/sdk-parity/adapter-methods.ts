import ts from "typescript";
import {
  type AdapterGraph,
  buildGraph,
  classMethod,
  nodeKey,
  reachableFrom,
} from "./adapter-graph.ts";

/**
 * Which adapter methods reach the wire through `@houston/sdk`, and which reach
 * it on their own.
 *
 * The adapter's mixin classes are the surface `app/src` calls — on desktop and
 * on web alike, because both surfaces depend on `@houston/engine-adapter` and
 * `packages/web` composes `app/src` verbatim. Classifying a mixin method IS
 * therefore classifying a desktop request site.
 *
 * `AdapterContext` is the transport: `cp`, `engine`, `baseUrl`, `token` and the
 * per-agent runtime clients are how a method reaches a server; `sdk` and
 * `sdkForSpace` (the same SDK pinned to one space) are how it delegates
 * instead. So a method is read off which context members it touches,
 * over everything it runs. {@link BOOKKEEPING} is the short list of context
 * members that carry no request — a member added to `AdapterContext` and not
 * listed there reads as transport, which over-reports rather than letting an
 * unbound request through unseen.
 */
const SDK_MEMBERS = new Set(["sdk", "sdkForSpace"]);

const BOOKKEEPING = new Set([
  ...SDK_MEMBERS,
  "workspaceIds",
  "activeLogins",
  "loginWatchers",
  "agentList",
  "noteAgentList",
  "noteAgentAdded",
  "noteAgentGone",
  "noteAgentsUnavailable",
  "currentAgentId",
  "requireAgentId",
  "providerAgentId",
  "dropLastAgentPref",
  "setActiveOrg",
  "setEndpoint",
]);

/** The adapter's own transports, for a helper handed `cp` rather than `ctx`. */
const TRANSPORT_CALL = /\b(?:cpFetch|httpRequest|gatewayAuthFetch)\s*\(/;
const CTX_MEMBER = /\bctx\.(\w+)/g;

/** One classified adapter method. */
export interface AdapterMethod {
  /** The method name. Unique: the mixin chain composes into ONE class. */
  name: string;
  /** Absolute path of the mixin file declaring it. */
  source: string;
  /** It reaches `this.ctx.sdk` somewhere in what it runs. */
  bound: boolean;
  /**
   * It reaches the transport and never the SDK — a request the shipped app
   * issues with no `@houston/sdk` method behind it.
   *
   * A method that reaches BOTH (an SDK write plus a raw probe of its own) is
   * not reported: the rule asks whether a method delegates to the SDK, and
   * that one does. Tightening it to per-request attribution needs dataflow
   * this graph deliberately does not do.
   */
  unbound: boolean;
}

/** Every public method of every mixin class in `files`, classified. */
export function classifyAdapter(files: string[]): AdapterMethod[] {
  const graph = buildGraph(files);
  const methods: AdapterMethod[] = [];
  for (const source of graph.sources) {
    if (!source.fileName.endsWith("-mixin.ts")) continue;
    for (const declaration of classesIn(source))
      for (const member of declaration.members) {
        if (!ts.isMethodDeclaration(member) || !isPublic(member)) continue;
        const method = classMethod(member, source);
        if (!method || method.name.startsWith("#")) continue;
        methods.push({
          name: method.name,
          source: source.fileName,
          ...classify(
            graph,
            source.fileName,
            declaration.name?.text,
            method.name,
          ),
        });
      }
  }
  return methods.sort((left, right) => left.name.localeCompare(right.name));
}

function classify(
  graph: AdapterGraph,
  file: string,
  cls: string | undefined,
  name: string,
): { bound: boolean; unbound: boolean } {
  let bound = false;
  let transport = false;
  for (const node of reachableFrom(graph, nodeKey(file, `${cls}.${name}`))) {
    if (TRANSPORT_CALL.test(node.text)) transport = true;
    for (const member of node.text.matchAll(CTX_MEMBER))
      if (SDK_MEMBERS.has(member[1] as string)) bound = true;
      else if (!BOOKKEEPING.has(member[1] as string)) transport = true;
  }
  return { bound, unbound: transport && !bound };
}

function classesIn(source: ts.SourceFile): ts.ClassLikeDeclaration[] {
  const found: ts.ClassLikeDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassLike(node) && node.name) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const HIDDEN: ts.SyntaxKind[] = [
  ts.SyntaxKind.PrivateKeyword,
  ts.SyntaxKind.ProtectedKeyword,
  ts.SyntaxKind.StaticKeyword,
];

const isPublic = (member: ts.MethodDeclaration): boolean =>
  !member.modifiers?.some((modifier) => HIDDEN.includes(modifier.kind));
