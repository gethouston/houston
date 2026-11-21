import type { FileEntry } from "./types";

export interface FolderNode {
  kind: "folder";
  name: string;
  path: string;
  children: TreeNode[];
  entry?: FileEntry;
  unfilteredChildCount?: number;
}

export interface FileNode {
  kind: "file";
  entry: FileEntry;
}

export type TreeNode = FolderNode | FileNode;

export function folderAtPath(
  root: FolderNode,
  path: string,
): FolderNode | null {
  if (!path) return root;
  let current = root;
  for (const segment of path.split("/")) {
    const next = current.children.find(
      (node): node is FolderNode =>
        node.kind === "folder" && node.name === segment,
    );
    if (!next) return null;
    current = next;
  }
  return current;
}

export function buildTree(files: FileEntry[]): FolderNode {
  const root: FolderNode = { kind: "folder", name: "", path: "", children: [] };

  for (const file of files) {
    if (file.is_directory) {
      const parts = file.path.split("/");
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const segment = parts[i];
        let child = node.children.find(
          (c): c is FolderNode => c.kind === "folder" && c.name === segment,
        );
        if (!child) {
          const folderPath = parts.slice(0, i + 1).join("/");
          child = {
            kind: "folder",
            name: segment,
            path: folderPath,
            children: [],
          };
          node.children.push(child);
        }
        node = child;
      }
      node.entry = file;
      continue;
    }

    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      const folderPath = parts.slice(0, i + 1).join("/");
      let child = node.children.find(
        (c): c is FolderNode => c.kind === "folder" && c.name === segment,
      );
      if (!child) {
        child = {
          kind: "folder",
          name: segment,
          path: folderPath,
          children: [],
        };
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({ kind: "file", entry: file });
  }

  return root;
}
