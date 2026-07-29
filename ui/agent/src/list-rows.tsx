/**
 * One level of the list tree: folder sections and file rows, in the order the
 * sort put them.
 *
 * This module and `folder-section.tsx` import each other, which is the honest
 * shape of a recursive tree: a level renders folders, and an open folder
 * renders a level. Neither reference is evaluated at module scope — both sit
 * inside a component body — so the cycle resolves the moment React renders.
 */
import { FileRow } from "./file-row";
import type { ListRowCallbacks } from "./files-list-chrome";
import { FolderSection } from "./folder-section";
import type { FolderNode } from "./tree";

export function ListRows({
  nodes,
  depth,
  ...rows
}: ListRowCallbacks & { nodes: FolderNode["children"]; depth: number }) {
  return nodes.map((child) =>
    child.kind === "folder" ? (
      <FolderSection key={child.path} {...rows} node={child} depth={depth} />
    ) : (
      <FileRow
        key={child.entry.path}
        {...rows}
        file={child.entry}
        depth={depth}
      />
    ),
  );
}
