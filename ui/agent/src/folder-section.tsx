import { cn, FolderGlyph } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { INTERNAL_DRAG_TYPE, useFolderDropTarget } from "./drop-zone";
import { FileMenu } from "./file-menu";
import {
  ACTIONS_CELL,
  colGrid,
  type ListRowCallbacks,
  META_CELL,
  META_TEXT,
  NAME_CELL_INNER,
  NAME_TEXT,
  ROW_CLASS,
  ROW_MARK,
  ROW_TILE_GLYPH,
} from "./files-list-chrome";
import { DisclosureChevron, RowIndent } from "./files-list-indent";
import { folderChildCount } from "./filter";
import { FolderEmptyRow } from "./folder-empty-row";
import { formatModified, formatModifiedFull } from "./format-modified";
import { RenameInput, useInlineRename } from "./inline-rename";
import { internalDragPayload, internalDragTypes } from "./internal-file-drag";
import { KebabButton } from "./kebab-button";
import { ListRows } from "./list-rows";
import type { FolderNode } from "./tree";
import type { FileEntry } from "./types";

export function FolderSection({
  node,
  depth,
  ...rows
}: ListRowCallbacks & { node: FolderNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { isOver, folderHandlers } = useFolderDropTarget(rows.dragScope);
  const { onDragActive, onDelete, onDownloadFolder, onMove, onRename } = rows;

  useEffect(() => {
    onDragActive?.(isOver ? node.path : null);
  }, [isOver, node.path, onDragActive]);

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
  const count = folderChildCount(node);
  const countLabel = rows.itemPlural
    ? `${count} ${count === 1 ? (rows.itemSingular ?? rows.itemPlural) : rows.itemPlural}`
    : null;

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: CSS grid layout — <tr> would break column sizing; role="row" is correct ARIA but the element must stay a div */}
      <div
        role="row"
        aria-expanded={open}
        tabIndex={0}
        draggable={!!onMove && !rename.renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(
            INTERNAL_DRAG_TYPE,
            internalDragPayload(node.path, rows.dragScope),
          );
          e.dataTransfer.setData(internalDragTypes(rows.dragScope)[1], "");
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => {
          setDragging(false);
        }}
        onClick={() => !rename.renaming && setOpen(!open)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !rename.renaming) {
            e.preventDefault();
            setOpen(!open);
          }
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
        style={{
          display: "grid",
          gridTemplateColumns: colGrid(),
        }}
        {...folderHandlers}
      >
        <div className="flex h-full min-w-0 items-center">
          <RowIndent depth={depth} />
          <DisclosureChevron open={open} className="mr-1" />
          <div className={NAME_CELL_INNER}>
            <span aria-hidden className={ROW_MARK}>
              <FolderGlyph small className={ROW_TILE_GLYPH} />
            </span>
            {rename.renaming ? (
              <RenameInput rename={rename} className="-ml-1" />
            ) : (
              <>
                <span className={cn("min-w-0 truncate", NAME_TEXT)}>
                  {node.name}
                </span>
                {countLabel && (
                  <span className={cn("shrink-0 tabular-nums", META_TEXT)}>
                    {countLabel}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <span
          className={META_CELL}
          title={formatModifiedFull(node.entry?.dateModified, rows.locale)}
        >
          <span className="truncate">
            {formatModified(
              node.entry?.dateModified,
              Date.now(),
              rows.locale,
              rows.modifiedTodayLabel,
            )}
          </span>
        </span>
        <span className={META_CELL} />
        <span className={ACTIONS_CELL}>
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
      {open &&
        (node.children.length > 0 ? (
          <ListRows nodes={node.children} depth={depth + 1} {...rows} />
        ) : (
          <FolderEmptyRow depth={depth + 1} label={rows.emptyFolderLabel} />
        ))}
    </>
  );
}
