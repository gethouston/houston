import { redactUrl } from "./redact-url";
import { mapOwnAttrs } from "./refs";
import {
  parseTree,
  renderTree,
  type TreeNode,
  unquoted,
  walk,
} from "./snapshot-tree";

export interface SnapshotView {
  interactive: boolean;
  query?: string;
  links: boolean;
}

export const FULL_VIEW: SnapshotView = { interactive: false, links: false };

const INTERACTIVE = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "treeitem",
]);

const POINTER = "[cursor=pointer]";
const QUERY_CONTEXT = 3;

export function isInteractive(node: TreeNode): boolean {
  return INTERACTIVE.has(node.role) || node.content.includes(POINTER);
}

function isBareWrapper(node: TreeNode): boolean {
  return (
    !node.content.includes(POINTER) &&
    /^(?:generic|none|presentation)(?: \[[^\]]*\])*:?$/.test(node.content)
  );
}

export interface ViewInput {
  tree: string;
  view: SnapshotView;
  pageUrl: string;
  previous?: ReadonlySet<string>;
}

export interface ViewOutput {
  tree: string;
  notes: string[];
  refs: Set<string>;
}

export function viewTree({
  tree,
  view,
  pageUrl,
  previous,
}: ViewInput): ViewOutput {
  const roots = parseTree(tree);
  const all = [...walk(roots)];
  const refs = new Set(all.flatMap((n) => (n.ref ? [n.ref] : [])));
  const shown = (n: TreeNode) =>
    !isBareWrapper(n) && (n.role !== "/url" || view.links);
  const wanted = (n: TreeNode) =>
    shown(n) &&
    (!view.interactive ||
      isInteractive(n) ||
      n.role === "heading" ||
      (n.role === "/url" && n.parent !== null && isInteractive(n.parent)));
  const isNew = (n: TreeNode) =>
    previous !== undefined && n.ref !== undefined && !previous.has(n.ref);
  const notes: string[] = [];
  const fresh = all.filter((n) => shown(n) && isNew(n)).length;
  if (fresh > 0) notes.push(`${fresh} new since the last look, marked [new].`);
  const keep = view.query
    ? queryKeep(all, wanted, shown, view.query, notes)
    : contextKeep(roots, wanted);
  const line = (n: TreeNode) => {
    let content = n.role === "/url" ? linkLine(n, pageUrl) : n.content;
    if (isNew(n))
      content = mapOwnAttrs(content, (attrs) =>
        attrs.replace(/\[ref=[^\]]+\]/, "$& [new]"),
      );
    return content;
  };
  return {
    tree: renderTree(roots, { keep: (n) => keep.has(n), line }),
    notes,
    refs,
  };
}

function contextKeep(
  roots: readonly TreeNode[],
  wanted: (n: TreeNode) => boolean,
): Set<TreeNode> {
  const keep = new Set<TreeNode>();
  const visit = (n: TreeNode): boolean => {
    const below = n.children.map(visit).some(Boolean);
    const kept = wanted(n) || (below && n.name !== undefined);
    if (kept) keep.add(n);
    return kept || below;
  };
  roots.forEach(visit);
  return keep;
}

function queryKeep(
  all: readonly TreeNode[],
  wanted: (n: TreeNode) => boolean,
  shown: (n: TreeNode) => boolean,
  query: string,
  notes: string[],
): Set<TreeNode> {
  const needle = query.toLowerCase();
  const matches = all.filter(
    (n) =>
      wanted(n) &&
      n.role !== "/url" &&
      n.content
        .replace(/ ?\[(?:ref=[^\]]+|cursor=pointer|active)\]/g, "")
        .toLowerCase()
        .includes(needle),
  );
  notes.push(
    matches.length === 0
      ? `Nothing on the page matches "${query}". Try a shorter word, or take a snapshot without query.`
      : `${matches.length} ${matches.length === 1 ? "line matches" : "lines match"} "${query}".`,
  );
  const keep = new Set<TreeNode>();
  for (const match of matches) {
    keep.add(match);
    for (const child of match.children)
      if (child.role === "/url" && wanted(child)) keep.add(child);
    let up = match.parent;
    for (let added = 0; up && added < QUERY_CONTEXT; up = up.parent) {
      if (!shown(up)) continue;
      keep.add(up);
      added += 1;
    }
  }
  return keep;
}

function linkLine(node: TreeNode, pageUrl: string): string {
  const raw = unquoted(node.content.replace(/^\/url:\s*/, ""));
  const absolute = URL.canParse(raw, pageUrl)
    ? new URL(raw, pageUrl).href
    : raw;
  return `/url: ${redactUrl(absolute)}`;
}
