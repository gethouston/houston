/**
 * Pure name filter for the FilesBrowser tree. Case-insensitive substring match
 * on the entry name, applied recursively: a folder survives when its own name
 * matches (its whole subtree comes with it, so you can browse what you found)
 * or when it still contains a match. No React here.
 */
import type { FolderNode, TreeNode } from "./tree";

/** Case-insensitive substring test used for every node name. */
export function matchesQuery(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.toLowerCase());
}

/**
 * Prune `folder`'s children against `query`. The folder's OWN name is never
 * tested — callers filter the folder they are already inside (grid view) or
 * the tree root (list view). A blank query is the identity.
 */
export function filterFolder(folder: FolderNode, query: string): FolderNode {
  const q = query.trim();
  if (!q) return folder;
  return { ...folder, children: filterNodes(folder.children, q) };
}

/**
 * How many children a folder really has, ignoring any search pruning. A folder
 * kept only because a descendant matched still shows its true size, so a card
 * never reads "1 item" for a folder holding twelve.
 */
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
