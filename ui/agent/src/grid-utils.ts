/**
 * Pure helpers for the grid view's per-folder navigation. No React here.
 */
import type { FolderNode } from "./tree";

/** Find the folder node at a "/"-separated relative path ("" = root). */
export function folderAtPath(
  root: FolderNode,
  path: string,
): FolderNode | null {
  if (!path) return root;
  let node = root;
  for (const segment of path.split("/")) {
    const child = node.children.find(
      (c): c is FolderNode => c.kind === "folder" && c.name === segment,
    );
    if (!child) return null;
    node = child;
  }
  return node;
}

/**
 * Deepest prefix of `path` that still exists in the tree. Keeps navigation
 * sane when the current folder is renamed/deleted by the agent or another
 * client mid-browse.
 */
export function resolveExistingPath(root: FolderNode, path: string): string {
  if (!path) return "";
  const kept: string[] = [];
  let node = root;
  for (const segment of path.split("/")) {
    const child = node.children.find(
      (c): c is FolderNode => c.kind === "folder" && c.name === segment,
    );
    if (!child) break;
    node = child;
    kept.push(segment);
  }
  return kept.join("/");
}

export interface Crumb {
  name: string;
  /** Relative path of this crumb ("" = root). */
  path: string;
}

/** Breadcrumb segments for a relative path (root crumb excluded). */
export function crumbsForPath(path: string): Crumb[] {
  if (!path) return [];
  const segments = path.split("/");
  return segments.map((name, i) => ({
    name,
    path: segments.slice(0, i + 1).join("/"),
  }));
}
