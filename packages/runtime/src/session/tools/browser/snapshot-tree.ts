import { ownRef } from "./refs";

export interface TreeNode {
  content: string;
  extra: string[];
  bullet: boolean;
  parent: TreeNode | null;
  children: TreeNode[];
  role: string;
  name: string | undefined;
  ref: string | undefined;
}

const ITEM = /^(\s*)- (.*)$/;
const ROLE = /^(\/?[\w-]+)/;
const NAME = /^\/?[\w-]+ "((?:[^"\\]|\\.)*)"/;

export function parseTree(tree: string): TreeNode[] {
  const roots: TreeNode[] = [];
  const open: { node: TreeNode; indent: number }[] = [];
  let last: { node: TreeNode; indent: number } | undefined;
  for (const line of tree.split("\n")) {
    const item = ITEM.exec(line);
    if (!item) {
      if (last && line.startsWith(" ".repeat(last.indent)))
        last.node.extra.push(line.slice(last.indent));
      else if (line.trim() !== "") roots.push(node(line, false, null));
      continue;
    }
    const indent = item[1]?.length ?? 0;
    while (open.length > 0 && (open.at(-1)?.indent ?? 0) >= indent) open.pop();
    const parent = open.at(-1)?.node ?? null;
    const created = node(item[2] ?? "", true, parent);
    (parent ? parent.children : roots).push(created);
    last = { node: created, indent };
    open.push(last);
  }
  return roots;
}

function node(
  content: string,
  bullet: boolean,
  parent: TreeNode | null,
): TreeNode {
  const nameMatch = bullet ? NAME.exec(content) : null;
  return {
    content,
    extra: [],
    bullet,
    parent,
    children: [],
    role: bullet ? (ROLE.exec(content)?.[1] ?? "") : "",
    name:
      nameMatch?.[1] === undefined ? undefined : unquoted(`"${nameMatch[1]}"`),
    ref: bullet ? ownRef(content) : undefined,
  };
}

export function* walk(nodes: readonly TreeNode[]): Generator<TreeNode> {
  for (const n of nodes) {
    yield n;
    yield* walk(n.children);
  }
}

export interface RenderOptions {
  keep: (node: TreeNode) => boolean;
  line?: (node: TreeNode) => string;
}

export function renderTree(
  nodes: readonly TreeNode[],
  options: RenderOptions,
): string {
  const out: string[] = [];
  const emit = (list: readonly TreeNode[], depth: number): boolean => {
    let any = false;
    for (const n of list) {
      if (!options.keep(n)) {
        if (emit(n.children, depth)) any = true;
        continue;
      }
      any = true;
      const indent = "  ".repeat(depth);
      const at = out.length;
      out.push("");
      const hasKids = emit(n.children, depth + 1);
      let content = options.line ? options.line(n) : n.content;
      if (!hasKids && n.children.length > 0 && content.endsWith(":"))
        content = content.slice(0, -1);
      out[at] = n.bullet ? `${indent}- ${content}` : `${indent}${content}`;
      out.splice(at + 1, 0, ...n.extra.map((line) => `${indent}${line}`));
    }
    return any;
  };
  emit(nodes, 0);
  return out.join("\n");
}

export function unquoted(value: string): string {
  if (!value.startsWith('"')) return value;
  try {
    const parsed: unknown = JSON.parse(
      value.replace(/\\(?:\\|x([0-9a-f]{2}))/g, (sequence, hex?: string) =>
        hex === undefined ? sequence : `\\u00${hex}`,
      ),
    );
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}
