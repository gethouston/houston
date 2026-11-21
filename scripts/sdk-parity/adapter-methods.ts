import ts from "typescript";
import {
  type AdapterGraph,
  buildGraph,
  classMethod,
  nodeKey,
  reachableFrom,
} from "./adapter-graph.ts";

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

const TRANSPORT_CALL = /\b(?:cpFetch|httpRequest|gatewayAuthFetch)\s*\(/;
const CTX_MEMBER = /\bctx\.(\w+)/g;

export interface AdapterMethod {
  name: string;
  source: string;
  bound: boolean;
  unbound: boolean;
}

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
