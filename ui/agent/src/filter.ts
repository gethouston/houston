import type { FolderNode, TreeNode } from "./tree";

export function matchesQuery(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.toLowerCase());
}

export function filterFolder(folder: FolderNode, query: string): FolderNode {
  const q = query.trim();
  if (!q) return folder;
  return { ...folder, children: filterNodes(folder.children, q) };
}

export function folderChildCount(folder: FolderNode): number {
  return folder.unfilteredChildCount ?? folder.children.length;
}

function filterNodes(nodes: TreeNode[], query: string): TreeNode[] {
  const kept: TreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      if (matchesQuery(node.entry.name, query)) kept.push(node);
      continue;
    }
    if (matchesQuery(node.name, query)) {
      kept.push(node);
      continue;
    }
    const children = filterNodes(node.children, query);
    if (children.length > 0)
      kept.push({
        ...node,
        children,
        unfilteredChildCount: folderChildCount(node),
      });
  }
  return kept;
}
