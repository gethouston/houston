/**
 * Finder-style formatting and sorting utilities. The Modified column's own
 * friendly date lives in format-modified.ts.
 */
import type { FileNode, FolderNode } from "./tree";

/** Format bytes like Finder (SI units: 1000, not 1024). */
export function formatSize(bytes: number): string {
  if (bytes === 0) return "Zero bytes";
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1000000) return `${Math.round(bytes / 1000)} KB`;
  if (bytes < 1000000000) return `${(bytes / 1000000).toFixed(1)} MB`;
  return `${(bytes / 1000000000).toFixed(1)} GB`;
}

// --- Sort ---

/** The three sortable columns — the same three the list view shows. */
export type SortKey = "name" | "dateModified" | "size";
export type SortDirection = "asc" | "desc";

/** Recursively sort a tree (folders first, then by selected column). */
export function sortTree(
  node: FolderNode,
  key: SortKey,
  direction: SortDirection,
): FolderNode {
  const sorted = [...node.children].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    if (a.kind === "folder" && b.kind === "folder") {
      const cmp = a.name.localeCompare(b.name);
      return direction === "asc" ? cmp : -cmp;
    }
    const fa = (a as FileNode).entry;
    const fb = (b as FileNode).entry;
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = fa.name.localeCompare(fb.name);
        break;
      // Order comes from the RAW timestamp, never the friendly wording: two
      // files both showing "Monday" still sort by the minute they landed.
      case "dateModified":
        cmp = (fa.dateModified ?? 0) - (fb.dateModified ?? 0);
        break;
      case "size":
        cmp = fa.size - fb.size;
        break;
    }
    return direction === "asc" ? cmp : -cmp;
  });
  return {
    ...node,
    children: sorted.map((c) =>
      c.kind === "folder" ? sortTree(c, key, direction) : c,
    ),
  };
}
