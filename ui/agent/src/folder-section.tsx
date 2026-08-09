/**
 * Finder-style expandable folder row (list view): click to expand/collapse,
 * kebab or right-click for rename / download-as-zip / delete, drop target for
 * moves, inline rename like file rows. Same affordances as the grid's
 * FolderChip. The row carries role="row" (like the file rows) rather than
 * role="button": a button prunes its children, which would hide the row's own
 * kebab from assistive tech. Expansion is how the list browses (it renders the
 * whole workspace, not one folder), so a folder that expands onto nothing says
 * so on a quiet row instead of leaving an open chevron over blank space.
 *
 * A folder row states its SIZE the only honest way it can: the number of
 * things inside it. That count is what makes a folder read as a container in a
 * list of files rather than as one more row.
 */
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
  ROW_TILE_GLYPH,
} from "./files-list-chrome";
import { DisclosureChevron, RowIndent } from "./files-list-indent";
import { folderChildCount } from "./filter";
import { FolderEmptyRow } from "./folder-empty-row";
import { formatModified, formatModifiedFull } from "./format-modified";
import { RenameInput, useInlineRename } from "./inline-rename";
import { internalDragPayload } from "./internal-file-drag";
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
  const { isOver, folderHandlers } = useFolderDropTarget();
  const { onDragActive, onDelete, onDownloadFolder, onMove, onRename } = rows;

  useEffect(() => {
    onDragActive?.(isOver ? node.path : null);
  }, [isOver, node.path, onDragActive]);

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
  // A folder's TRUE size: a search prunes children, it never shrinks a folder.
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
        style={{
          display: "grid",
          gridTemplateColumns: colGrid(!!rows.selection),
        }}
        {...folderHandlers}
      >
        {/* A folder is not part of the file selection: deleting one is a
            heavier act with its own confirm. The gutter still holds its place
            so the icons of both row kinds line up. */}
        {rows.selection && <span />}
        <div className="flex h-full min-w-0 items-center">
          {/* The chevron sits OUTSIDE the name wrapper on purpose: a file row
              at this depth pads past exactly this chevron + gap to line its
              tile up with this glyph. Inside the wrapper, folder rows would
              start 24px left of every file's and the tree would staircase. */}
          <RowIndent depth={depth} />
          <DisclosureChevron open={open} className="mr-2" />
          <div className={NAME_CELL_INNER}>
            <FolderGlyph small className={ROW_TILE_GLYPH} />
            {rename.renaming ? (
              <RenameInput rename={rename} className="-ml-1" />
            ) : (
              <>
                <span className={cn("min-w-0 truncate", NAME_TEXT)}>
                  {node.name}
                </span>
                {countLabel && (
                  <span
                    className={cn("shrink-0 tabular-nums", META_TEXT)}
                    // The count is a fact about the folder, not a column: it
                    // rides beside the name so it moves with the indent.
                  >
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
        {/* A folder has no size of its own: a blank cell, never invented data. */}
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
          <FolderEmptyRow
            depth={depth + 1}
            label={rows.emptyFolderLabel}
            selectable={!!rows.selection}
          />
        ))}
    </>
  );
}
