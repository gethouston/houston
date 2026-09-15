import ts from "typescript";
import { unwrap } from "./adapter-ast.ts";
import { importedFrom, localNames } from "./adapter-scope.ts";

/**
 * The adapter's call graph, coarse on purpose.
 *
 * Classifying an adapter method (`adapter-methods.ts`) means reading what it
 * runs, and almost nothing runs only its own body: a mixin method delegates to
 * a private sibling, to a helper in a neighbouring module, or to a small class
 * it constructs. So every function-ish body in the adapter becomes a node, and
 * every call or `new` becomes an edge — resolved through the calling file's own
 * imports, so two helpers sharing a name stay distinct.
 *
 * A class also gets ONE aggregate node under its own name whose edges are all
 * its methods: `new SidebarLayoutStore(ctx)` then pulls in everything the
 * instance could run, without resolving what the caller does with it.
 * Over-reaching that way is the safe direction — it can only make a method look
 * like it does MORE, never hide what it does.
 */
export interface GraphNode {
  /** Body text, for the caller's marker scan. */
  text: string;
  /** Keys of nodes this one may run. */
  edges: string[];
}

export const nodeKey = (file: string, name: string): string =>
  `${file}#${name}`;

/** What one file's names resolve against while its edges are read. */
interface FileScope {
  file: string;
  imports: Map<string, string>;
  locals: Set<string>;
}

/** Every node a body may run. `this.ctx.*` is deliberately NOT an edge: the
 *  context is the transport, and its members are read as markers instead.
 *
 *  A callee and the object it hangs off are both read through {@link unwrap}:
 *  `(helper as Fn)()` and `(await ready).refresh()` name the same helper as
 *  their bare spellings, and a wrapper that swallowed the edge would make a
 *  method look like it does LESS — the direction this graph must never err in. */
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

/** The name and body a class member publishes, or null when it has neither. */
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
  /** The adapter's own sources, parsed. */
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

/** Every node reachable from `start`, itself included. */
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
