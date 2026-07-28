/**
 * Finder-style expandable folder row (list view): click to expand/collapse,
 * kebab or right-click for rename / download-as-zip / delete, drop target for
 * moves, inline rename like file rows. Same affordances as the grid's
 * FolderCard. The row carries role="row" (like the file rows) rather than
 * role="button": a button prunes its children, which would hide the row's own
 * kebab from assistive tech.
 */
import { cn } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { KebabButton } from "./card-chrome";
import { INTERNAL_DRAG_TYPE, useFolderDropTarget } from "./drop-zone";
import { FileMenu } from "./file-menu";
import { FileRow, ROW_CLASS } from "./file-row";
import { FolderGlyph } from "./file-type-icons";
import {
  BASE_INDENT,
  COL_GRID,
  DEPTH_INDENT,
  DisclosureChevron,
  type ListRowCallbacks,
  META_CELL,
} from "./files-list-chrome";
import { RenameInput, useInlineRename } from "./inline-rename";
import type { FolderNode } from "./tree";
import type { FileEntry } from "./types";
import { formatFileManagerDate } from "./utils";

export function FolderSection({
  node,
  depth,
  ...rows
}: ListRowCallbacks & { node: FolderNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { isOver, folderHandlers } = useFolderDropTarget();
  const { onDragActive, onDelete, onDownloadFolder, onMove, onRename } = rows;

  useEffect(() => {
    onDragActive?.(isOver ? node.path : null);
  }, [isOver, node.path, onDragActive]);

  const padLeft = BASE_INDENT + depth * DEPTH_INDENT;
  // The menu reuses FileMenu, which speaks FileEntry — implied parent folders
  // have no listing entry, so synthesize one from the node.
  const folderEntry: FileEntry = node.entry ?? {
    path: node.path,
    name: node.name,
    extension: "",
    size: 0,
    is_directory: true,
  };
  const rename = useInlineRename(
    node.name,
    onRename ? (newName) => onRename(folderEntry, newName) : undefined,
  );
  const hasMenu = onDownloadFolder || onDelete || onRename;

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: CSS grid layout — <tr> would break column sizing; role="row" is correct ARIA but the element must stay a div */}
      <div
        role="row"
        aria-expanded={open}
        tabIndex={0}
        draggable={!!onMove && !rename.renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(INTERNAL_DRAG_TYPE, node.path);
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onClick={() => !rename.renaming && setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !rename.renaming) setOpen(!open);
          if (e.key === "Escape" && rename.renaming) rename.cancel();
        }}
        onContextMenu={(e) => {
          if (!hasMenu || rename.renaming) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={cn(
          ROW_CLASS,
          "w-full text-left",
          isOver && "!bg-focus/15 ring-2 ring-focus",
          dragging && "opacity-40",
        )}
        style={{ display: "grid", gridTemplateColumns: COL_GRID }}
        {...folderHandlers}
      >
        <div
          className="flex min-w-0 items-center gap-1.5 pr-1.5"
          style={{ paddingLeft: padLeft }}
        >
          <DisclosureChevron open={open} />
          <FolderGlyph small />
          {rename.renaming ? (
            <RenameInput rename={rename} className="-ml-1" />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm">{node.name}</span>
          )}
        </div>
        <span className={META_CELL}>
          {formatFileManagerDate(node.entry?.dateModified)}
        </span>
        <span className={META_CELL}>
          {formatFileManagerDate(node.entry?.dateCreated)}
        </span>
        {/* A folder has no size of its own: a blank cell, never invented data. */}
        <span className={cn(META_CELL, "text-right")} />
        <span className={META_CELL}>{rows.kindFolderLabel}</span>
        <span className="flex items-center justify-center">
          {hasMenu && (
            <KebabButton label={rows.menuButtonLabel} onOpen={setMenu} />
          )}
        </span>
      </div>
      {menu && (
        <FileMenu
          file={folderEntry}
          position={menu}
          onClose={() => setMenu(null)}
          onRename={onRename ? rename.start : undefined}
          onDownload={onDownloadFolder}
          onDelete={onDelete}
          labels={rows.menuLabels}
        />
      )}
      {open && <ListRows nodes={node.children} depth={depth + 1} {...rows} />}
    </>
  );
}

/** One level of the list tree: folder sections and file rows, in order. */
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
        selected={rows.selectedPath === child.entry.path}
      />
    ),
  );
}
