/**
 * Finder-style expandable folder row (list view): click to expand/collapse,
 * right-click for rename / download-as-zip / delete, drop target for moves,
 * inline rename like file rows.
 */
import { cn } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { INTERNAL_DRAG_TYPE, useFolderDropTarget } from "./drop-zone";
import { DisclosureChevron, FolderIcon } from "./file-manager-icons";
import { FileMenu, type FileMenuLabels } from "./file-menu";
import { BASE_INDENT, COL_GRID, DEPTH_INDENT, FileRow } from "./file-row";
import { RenameInput, useInlineRename } from "./inline-rename";
import type { FolderNode } from "./tree";
import type { FileEntry } from "./types";
import { formatFileManagerDate } from "./utils";

export function FolderSection({
  node,
  depth,
  selectedPath,
  onSelect,
  onOpen,
  onReveal,
  onDownload,
  onDownloadFolder,
  onDelete,
  onRename,
  onFilesDropped,
  onDragActive,
  onMove,
  menuLabels,
}: {
  node: FolderNode;
  depth: number;
  selectedPath?: string | null;
  onSelect?: (file: FileEntry) => void;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  onDownload?: (file: FileEntry) => void;
  /** Download the folder's subtree (as a zip). */
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  onDragActive?: (folder: string | null) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  menuLabels?: FileMenuLabels;
}) {
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { isOver, folderHandlers } = useFolderDropTarget();

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
      {/* biome-ignore lint/a11y/useSemanticElements: CSS grid row hosting an inline rename input — a native <button> cannot contain it; role + tabIndex keep it keyboard-operable */}
      <div
        role="button"
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
          "h-[24px] w-full cursor-default select-none items-center text-left outline-none",
          isOver && "!rounded-lg !bg-focus/15",
          dragging && "opacity-40",
        )}
        style={{ display: "grid", gridTemplateColumns: COL_GRID }}
        {...folderHandlers}
      >
        <div
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: padLeft }}
        >
          <DisclosureChevron open={open} />
          <FolderIcon />
          {rename.renaming ? (
            <RenameInput rename={rename} className="-ml-1" />
          ) : (
            <span className="truncate text-[13px]">{node.name}</span>
          )}
        </div>
        <span className="truncate px-2 text-[11px] text-ink-muted">
          {formatFileManagerDate(node.entry?.dateModified)}
        </span>
        <span className="truncate px-2 text-[11px] text-ink-muted">
          {formatFileManagerDate(node.entry?.dateCreated)}
        </span>
        <span className="px-2 text-right text-[11px] text-ink-muted">--</span>
        <span className="truncate px-2 text-[11px] text-ink-muted">Folder</span>
      </div>
      {menu && (
        <FileMenu
          file={folderEntry}
          position={menu}
          onClose={() => setMenu(null)}
          onRename={onRename ? rename.start : undefined}
          onDownload={onDownloadFolder}
          onDelete={onDelete}
          labels={menuLabels}
        />
      )}
      {open &&
        node.children.map((child) =>
          child.kind === "folder" ? (
            <FolderSection
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onOpen={onOpen}
              onReveal={onReveal}
              onDownload={onDownload}
              onDownloadFolder={onDownloadFolder}
              onDelete={onDelete}
              onRename={onRename}
              onFilesDropped={onFilesDropped}
              onDragActive={onDragActive}
              onMove={onMove}
              menuLabels={menuLabels}
            />
          ) : (
            <FileRow
              key={child.entry.path}
              file={child.entry}
              depth={depth + 1}
              selected={selectedPath === child.entry.path}
              onSelect={onSelect}
              onOpen={onOpen}
              onReveal={onReveal}
              onDownload={onDownload}
              onDelete={onDelete}
              onRename={onRename}
              onMove={onMove}
              menuLabels={menuLabels}
            />
          ),
        )}
    </>
  );
}
