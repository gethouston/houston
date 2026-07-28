/**
 * Finder-style file row (list view): click to select, double-click to open,
 * kebab or right-click for the context menu, inline rename, draggable for
 * moves. Same affordances as the grid's FileCard.
 */
import { cn } from "@houston-ai/core";
import { useState } from "react";
import { KebabButton } from "./card-chrome";
import { INTERNAL_DRAG_TYPE } from "./drop-zone";
import { FileMenu, type FileMenuLabels } from "./file-menu";
import { FileTypeIcon } from "./file-type-icons";
import {
  BASE_INDENT,
  COL_GRID,
  DEPTH_INDENT,
  META_CELL,
  TRIANGLE_AREA,
} from "./files-list-chrome";
import { RenameInput, useInlineRename } from "./inline-rename";
import type { FileEntry } from "./types";
import { formatFileManagerDate, formatSize, getKind } from "./utils";

/** Row shell shared with FolderSection: height, quiet hover, focus ring. */
export const ROW_CLASS =
  "h-8 cursor-default select-none items-center rounded-lg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus";

/** Selected row: the same quiet language the grid's selected card speaks. */
export const ROW_SELECTED_CLASS = "bg-chip-subtle ring-2 ring-action";

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
  menuButtonLabel,
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
  /** Accessible name for the always-visible kebab button. */
  menuButtonLabel?: string;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const rename = useInlineRename(
    file.name,
    onRename ? (newName) => onRename(file, newName) : undefined,
  );
  const padLeft = BASE_INDENT + depth * DEPTH_INDENT + TRIANGLE_AREA;
  const hasMenu = onOpen || onReveal || onDownload || onDelete || onRename;

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
          ROW_CLASS,
          selected && ROW_SELECTED_CLASS,
          dragging && "opacity-40",
        )}
        style={{ display: "grid", gridTemplateColumns: COL_GRID }}
      >
        <div
          className="flex min-w-0 items-center gap-1.5 pr-1.5"
          style={{ paddingLeft: padLeft }}
        >
          <FileTypeIcon extension={file.extension} />
          {rename.renaming ? (
            <RenameInput rename={rename} className="-ml-1" />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          )}
        </div>
        <span className={META_CELL}>
          {formatFileManagerDate(file.dateModified)}
        </span>
        <span className={META_CELL}>
          {formatFileManagerDate(file.dateCreated)}
        </span>
        <span className={cn(META_CELL, "text-right")}>
          {formatSize(file.size)}
        </span>
        <span className={META_CELL}>{getKind(file.extension)}</span>
        <span className="flex items-center justify-center">
          {hasMenu && (
            <KebabButton
              label={menuButtonLabel}
              onOpen={(position) => {
                onSelect?.(file);
                setMenu(position);
              }}
            />
          )}
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
