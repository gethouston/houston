/**
 * Finder-style file row (list view): click to select, double-click to open,
 * right-click context menu, inline rename, draggable for moves.
 */
import { cn } from "@houston-ai/core";
import { useState } from "react";
import { INTERNAL_DRAG_TYPE } from "./drop-zone";
import { getFileIcon } from "./file-manager-icons";
import { FileMenu, type FileMenuLabels } from "./file-menu";
import { RenameInput, useInlineRename } from "./inline-rename";
import type { FileEntry } from "./types";
import { formatFileManagerDate, formatSize, getKind } from "./utils";

export const DEPTH_INDENT = 20;
export const BASE_INDENT = 12;
const TRIANGLE_AREA = 16;

/** Column grid shared between header and rows. */
export const COL_GRID = "1fr 160px 160px 80px 130px";

export function FileRow({
  file,
  depth = 0,
  selected,
  onSelect,
  onOpen,
  onReveal,
  onDownload,
  onDelete,
  onRename,
  onMove,
  menuLabels,
}: {
  file: FileEntry;
  depth?: number;
  selected?: boolean;
  onSelect?: (file: FileEntry) => void;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  onDownload?: (file: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  menuLabels?: FileMenuLabels;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const rename = useInlineRename(
    file.name,
    onRename ? (newName) => onRename(file, newName) : undefined,
  );
  const padLeft = BASE_INDENT + depth * DEPTH_INDENT + TRIANGLE_AREA;
  const hasMenu = onOpen || onReveal || onDownload || onDelete;
  const sec = selected ? "text-action-text/80" : "text-ink-muted";

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: CSS grid layout — <tr> would break column sizing; role="row" is correct ARIA but the element must stay a div */}
      <div
        role="row"
        tabIndex={0}
        draggable={!!onMove && !rename.renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(INTERNAL_DRAG_TYPE, file.path);
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onClick={() => !rename.renaming && onSelect?.(file)}
        onDoubleClick={() => !rename.renaming && onOpen?.(file)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && selected && !rename.renaming) {
            e.preventDefault();
            rename.start();
          }
          if (e.key === "Escape" && rename.renaming) rename.cancel();
        }}
        onContextMenu={(e) => {
          if (!hasMenu || rename.renaming) return;
          e.preventDefault();
          onSelect?.(file);
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        data-selected={selected || undefined}
        className={cn(
          "h-[24px] cursor-default select-none items-center outline-none",
          selected && "rounded-lg !bg-action text-action-text",
          dragging && "opacity-40",
        )}
        style={{ display: "grid", gridTemplateColumns: COL_GRID }}
      >
        <div
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: padLeft }}
        >
          {getFileIcon(file.extension)}
          {rename.renaming ? (
            <RenameInput rename={rename} className="-ml-1" />
          ) : (
            <span className="truncate text-[13px]">{file.name}</span>
          )}
        </div>
        <span className={cn("truncate px-2 text-[11px]", sec)}>
          {formatFileManagerDate(file.dateModified)}
        </span>
        <span className={cn("truncate px-2 text-[11px]", sec)}>
          {formatFileManagerDate(file.dateCreated)}
        </span>
        <span className={cn("px-2 text-right text-[11px]", sec)}>
          {formatSize(file.size)}
        </span>
        <span className={cn("truncate px-2 text-[11px]", sec)}>
          {getKind(file.extension)}
        </span>
      </div>
      {menu && (
        <FileMenu
          file={file}
          position={menu}
          onClose={() => setMenu(null)}
          onOpen={onOpen}
          onRename={onRename ? rename.start : undefined}
          onReveal={onReveal}
          onDownload={onDownload}
          onDelete={onDelete}
          labels={menuLabels}
        />
      )}
    </>
  );
}
