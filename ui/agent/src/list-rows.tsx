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
