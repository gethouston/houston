import ts from "typescript";
import { unwrap } from "../assistant-catalog/assistant-ast.ts";
import { importedFrom, localNames } from "./adapter-scope.ts";

export interface GraphNode {
  text: string;
  edges: string[];
}

export const nodeKey = (file: string, name: string): string =>
  `${file}#${name}`;

interface FileScope {
  file: string;
  imports: Map<string, string>;
  locals: Set<string>;
}

function edgesOf(
  body: ts.Node,
  scope: FileScope,
  enclosingClass: string | null,
): string[] {
  const edges: string[] = [];
  const target = (callee: ts.Expression): void => {
    const expression = unwrap(callee);
    if (ts.isIdentifier(expression)) {
      const from = scope.imports.get(expression.text);
      if (from) edges.push(nodeKey(from, expression.text));
      if (scope.locals.has(expression.text))
        edges.push(nodeKey(scope.file, expression.text));
      return;
    }
    if (!ts.isPropertyAccessExpression(expression)) return;
    const object = unwrap(expression.expression);
    if (ts.isIdentifier(object)) {
      const from = scope.imports.get(object.text);
      if (from) edges.push(nodeKey(from, expression.name.text));
    } else if (object.kind === ts.SyntaxKind.ThisKeyword && enclosingClass)
      edges.push(
        nodeKey(scope.file, `${enclosingClass}.${expression.name.text}`),
      );
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node))
      target(node.expression);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return edges;
}

export function classMethod(
  member: ts.ClassElement,
  source: ts.SourceFile,
): { name: string; body: ts.Block } | null {
  return ts.isMethodDeclaration(member) && member.body
    ? { name: member.name.getText(source), body: member.body }
    : null;
}

function readFile(source: ts.SourceFile, nodes: Map<string, GraphNode>): void {
  const scope: FileScope = {
    file: source.fileName,
    imports: importedFrom(source),
    locals: localNames(source),
  };
  const record = (name: string, body: ts.Node, cls: string | null): void => {
    nodes.set(nodeKey(scope.file, name), {
      text: body.getText(source),
      edges: edgesOf(body, scope, cls),
    });
  };
  const walk = (node: ts.Node, cls: string | null): void => {
    if (ts.isClassLike(node) && node.name) {
      const name = node.name.text;
      const methods = node.members.flatMap((member) => {
        const method = classMethod(member, source);
        return method ? [method] : [];
      });
      nodes.set(nodeKey(scope.file, name), {
        text: "",
        edges: methods.map((m) => nodeKey(scope.file, `${name}.${m.name}`)),
      });
      for (const method of methods)
        record(`${name}.${method.name}`, method.body, name);
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body)
      record(node.name.text, node.body, cls);
    else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    )
      record(node.name.text, node.initializer.body, cls);
    ts.forEachChild(node, (child) => walk(child, cls));
  };
  walk(source, null);
}

export interface AdapterGraph {
  nodes: Map<string, GraphNode>;
  sources: ts.SourceFile[];
}

export function buildGraph(files: string[]): AdapterGraph {
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noResolve: true,
  });
  const wanted = new Set(files);
  const sources = program
    .getSourceFiles()
    .filter((source) => wanted.has(source.fileName));
  const nodes = new Map<string, GraphNode>();
  for (const source of sources) readFile(source, nodes);
  return { nodes, sources };
}

export function reachableFrom(graph: AdapterGraph, start: string): GraphNode[] {
  const seen = new Set<string>();
  const found: GraphNode[] = [];
  const stack = [start];
  while (stack.length > 0) {
    const at = stack.pop() as string;
    if (seen.has(at)) continue;
    seen.add(at);
    const node = graph.nodes.get(at);
    if (!node) continue;
    found.push(node);
    stack.push(...node.edges);
  }
  return found;
}
