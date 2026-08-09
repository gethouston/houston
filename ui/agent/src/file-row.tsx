/**
 * Library-style file row (list view): a single click opens the file, the
 * gutter checkbox is the ONLY way to select it, and the kebab or a right-click
 * carries everything else (rename, download, delete). Draggable for moves.
 * Selecting and opening are deliberately different gestures now — a click that
 * both highlighted and did nothing else was a dead click.
 *
 * The row draws no separator: it is a transparent object that paints a soft
 * rounded fill under the pointer, and a checked row keeps a quieter fill of its
 * own so a selection is legible without counting checkboxes.
 */
import { cn } from "@houston-ai/core";
import { useState } from "react";
import { INTERNAL_DRAG_TYPE } from "./drop-zone";
import { FileMenu, type FileMenuLabels } from "./file-menu";
import { FileRowIcon } from "./file-row-icon";
import { FilesCheckbox } from "./files-checkbox";
import {
  ACTIONS_CELL,
  colGrid,
  META_CELL,
  NAME_CELL_INNER,
  NAME_TEXT,
  ROW_CHECKED,
  ROW_CLASS,
} from "./files-list-chrome";
import { RowIndent } from "./files-list-indent";
import type { FilesSelection } from "./files-selection";
import { formatModified, formatModifiedFull } from "./format-modified";
import { RenameInput, useInlineRename } from "./inline-rename";
import { internalDragPayload } from "./internal-file-drag";
import { KebabButton } from "./kebab-button";
import type { FileEntry, LoadFilePreview } from "./types";
import { formatSize } from "./utils";

export function FileRow({
  file,
  depth = 0,
  selection,
  loadPreview,
  onOpen,
  onReveal,
  onDownload,
  onDelete,
  onRename,
  onMove,
  locale,
  modifiedTodayLabel,
  menuLabels,
  menuButtonLabel,
  dragScope,
}: {
  file: FileEntry;
  depth?: number;
  /** Present only when the browser can act on a selection (see FilesSelection). */
  selection?: FilesSelection;
  loadPreview?: LoadFilePreview;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  onDownload?: (file: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  /** BCP-47 tag for the Modified cell; undefined follows the browser. */
  locale?: string;
  /** Translated word the Modified cell shows for the current calendar day. */
  modifiedTodayLabel: string;
  menuLabels?: FileMenuLabels;
  /** Accessible name for the always-visible kebab button. */
  menuButtonLabel?: string;
  dragScope?: string;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const rename = useInlineRename(
    file.name,
    onRename ? (newName) => onRename(file, newName) : undefined,
  );
  const hasMenu = onOpen || onReveal || onDownload || onDelete || onRename;
  const checked = !!selection?.paths.has(file.path);

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: CSS grid layout — <tr> would break column sizing; role="row" is correct ARIA but the element must stay a div */}
      <div
        role="row"
        tabIndex={0}
        draggable={!!onMove && !rename.renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(
            INTERNAL_DRAG_TYPE,
            internalDragPayload(file.path, dragScope),
          );
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onClick={() => !rename.renaming && onOpen?.(file)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !rename.renaming) {
            e.preventDefault();
            onOpen?.(file);
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
          checked && ROW_CHECKED,
          dragging && "opacity-40",
        )}
        style={{
          display: "grid",
          gridTemplateColumns: colGrid(!!selection),
        }}
      >
        {selection && (
          <span className="flex h-full items-center justify-center">
            <FilesCheckbox
              checked={checked}
              label={selection.labels.selectRow}
              onToggle={() => selection.toggle(file.path)}
            />
          </span>
        )}
        <div className="flex h-full min-w-0 items-center">
          <RowIndent depth={depth} chevron />
          <div className={NAME_CELL_INNER}>
            <FileRowIcon file={file} loadPreview={loadPreview} />
            {rename.renaming ? (
              <RenameInput rename={rename} className="-ml-1" />
            ) : (
              <span className={cn("min-w-0 flex-1 truncate", NAME_TEXT)}>
                {file.name}
              </span>
            )}
          </div>
        </div>
        <span
          className={META_CELL}
          title={formatModifiedFull(file.dateModified, locale)}
        >
          <span className="truncate">
            {formatModified(
              file.dateModified,
              Date.now(),
              locale,
              modifiedTodayLabel,
            )}
          </span>
        </span>
        <span className={META_CELL}>
          <span className="truncate">{formatSize(file.size)}</span>
        </span>
        <span className={ACTIONS_CELL}>
          {hasMenu && <KebabButton label={menuButtonLabel} onOpen={setMenu} />}
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
