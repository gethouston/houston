/**
 * List-view chrome shared by the column header, the file/folder rows, the
 * new-folder row and the skeleton: the column template, the row shell, the cell
 * classes and the quiet sortable header cell. Every geometry value lives HERE
 * exactly once, or the header, the rows and the skeleton drift apart. How a row
 * states its DEPTH (indent + disclosure chevron) is files-list-indent.tsx.
 *
 * The list draws no rules; spacing and a soft hover fill separate rows.
 */
import { cn } from "@houston-ai/core";
import type { CSSProperties } from "react";
import type { FileMenuLabels } from "./file-menu";
import type { FilesSelection } from "./files-selection";
import type { FileEntry, LoadFilePreview } from "./types";
import type { SortDirection, SortKey } from "./utils";

/**
 * The callbacks and labels every list row forwards down the tree unchanged.
 * Rows pass them on as one bag, so a new row capability never has to be
 * threaded through each level of the recursion by hand.
 */
export interface ListRowCallbacks {
  /** Identifies the filesystem boundary encoded into internal drags. */
  dragScope?: string;
  /** Present only when the consumer can act on a selection: its presence puts
   *  a checkbox in each file row's tree slot. */
  selection?: FilesSelection;
  /** Lazily fetch thumbnail bytes for a visible image row. */
  loadPreview?: LoadFilePreview;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  onDownload?: (file: FileEntry) => void;
  /** Download a folder's subtree (as a zip). */
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  /** "" = root hovered, null = nothing hovered (see FilesBrowser). */
  onDragActive?: (folder: string | null) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  /** BCP-47 tag for the Modified column; undefined follows the browser. */
  locale?: string;
  /** Translated word the Modified cell shows for the current calendar day. */
  modifiedTodayLabel: string;
  /** Nouns a folder row counts its children with ("item" / "items"). */
  itemSingular?: string;
  itemPlural?: string;
  menuLabels?: FileMenuLabels;
  /** Accessible name for the always-visible kebab buttons. */
  menuButtonLabel?: string;
  /** Shown under a folder row expanded onto nothing, so an open chevron with
   *  no rows beneath it never reads as a listing that failed to load. */
  emptyFolderLabel?: string;
}

/** Where the first level starts, measured from inside ROW_PAD_X. */
export const BASE_INDENT = 4;
/** One level of the tree. */
export const DEPTH_INDENT = 20;
/** Chevron (16px) + its gap (4px): what a file row pads past so its tile lines
 *  up with the folder glyphs at the same depth. */
export const TRIANGLE_AREA = 20;

/**
 * The hover pill bleeds 8px past the text gutter on both sides, so the fill
 * reads as a surface UNDER the row rather than as a box drawn around it. The
 * rows container pulls that back out (`LIST_INSET`) and every row and the
 * column header pay it back (`ROW_PAD_X`) — they must move together or the
 * columns shift the moment the header swaps for the selection bar.
 */
export const LIST_INSET = "-mx-2";
export const FILES_CONTENT_COLUMN = "w-full px-6";
const ROW_PAD_X = "px-2";

/**
 * One source of truth for the column template: Name, Modified, Size, then the
 * actions column where every row's kebab sits, aligned with the one above it.
 * A file's TYPE is carried by its leading mark, which is why there is no Kind
 * column to align. Modified and Size are held narrow ON PURPOSE: right-aligned
 * and packed, the two read as ONE block against the pane's right edge instead
 * of as two islands adrift in the middle of the row.
 *
 */
export function colGrid(): string {
  return "minmax(180px,1fr) minmax(96px,116px) minmax(64px,80px) 44px";
}

/**
 * Row shell shared by file rows, folder rows, the empty-folder row, the
 * new-folder row and the skeleton. `group/row` is what lets the tree checkbox
 * strengthen while the pointer is anywhere on the row.
 */
export const ROW_CLASS = cn(
  "group/row h-10 cursor-default select-none items-center rounded-lg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus",
  ROW_PAD_X,
);

/**
 * A CHECKED row, so a selection is legible from across the screen rather than
 * from a 16px box. It sits one step below the hover fill, which still paints
 * over it — a checked row under the pointer must not look inert.
 */
export const ROW_CHECKED = "bg-chip-subtle";

/** The column header / selection-bar slot: same padding as a row. */
export const HEADER_ROW = cn("h-8 shrink-0 select-none", ROW_PAD_X);

/** Filenames: the one thing on this screen worth reading first. */
export const NAME_TEXT = "text-sm font-medium text-ink";
/** Everything a filename is not: dates, sizes, counts, the empty-folder note. */
export const META_TEXT = "text-xs text-ink-muted";

/**
 * Both metadata cells. They are right-aligned together: ragged-left dates
 * ending on the same x read as a column, and it puts Modified and Size within
 * one glance of each other instead of a screen apart.
 */
export const META_CELL = cn(
  "flex h-full items-center justify-end px-2 tabular-nums",
  META_TEXT,
);

/** The actions (kebab) cell. */
export const ACTIONS_CELL = "flex h-full items-center justify-center";

/** The Name cell's inner wrapper: everything from the item's icon rightwards. */
export const NAME_CELL_INNER =
  "flex h-full min-w-0 flex-1 items-center gap-2 pr-1.5";

/** The shared footprint for every leading mark in the icon column. */
export const ROW_MARK = "flex size-6 shrink-0 items-center justify-center";

/** The rounded image-thumbnail footprint. */
export const ROW_TILE = "size-6 rounded-md";
export const ROW_TILE_GLYPH = "size-4";

export function HeaderCell({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
  style,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
  /** Pixel alignment the class layer cannot express (the Name column's indent). */
  style?: CSSProperties;
}) {
  const active = sortKey === col;
  return (
    // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: the CSS-grid cell needs columnheader semantics while its nested sort button remains the focusable control.
    <span role="columnheader" className="h-full min-w-0">
      <button
        type="button"
        onClick={() => onSort(col)}
        style={style}
        className={cn(
          // The sort caret hugs its label instead of being pushed to the column's
          // far edge — over a 1fr Name column that put it a screen away from the
          // word it describes.
          "flex h-full w-full items-center gap-1.5 rounded-sm px-2 font-medium transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          META_TEXT,
          className,
        )}
      >
        <span className="truncate">{label}</span>
        {active && (
          <svg
            className="size-[8px] shrink-0"
            viewBox="0 0 8 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label={
              sortDir === "asc" ? "sorted ascending" : "sorted descending"
            }
          >
            {sortDir === "asc" ? (
              <path d="M1 4.5L4 1.5L7 4.5" />
            ) : (
              <path d="M1 1.5L4 4.5L7 1.5" />
            )}
          </svg>
        )}
      </button>
    </span>
  );
}
