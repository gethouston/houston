import { cn } from "@houston-ai/core";
import type { CSSProperties } from "react";
import type { FileMenuLabels } from "./file-menu";
import type { FilesSelection } from "./files-selection";
import type { FileEntry, LoadFilePreview } from "./types";
import type { SortDirection, SortKey } from "./utils";

export interface ListRowCallbacks {
  dragScope?: string;
  selection?: FilesSelection;
  loadPreview?: LoadFilePreview;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  onDownload?: (file: FileEntry) => void;
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  onDragActive?: (folder: string | null) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  locale?: string;
  modifiedTodayLabel: string;
  itemSingular?: string;
  itemPlural?: string;
  menuLabels?: FileMenuLabels;
  menuButtonLabel?: string;
  emptyFolderLabel?: string;
}

export const BASE_INDENT = 4;
export const DEPTH_INDENT = 20;
export const TRIANGLE_AREA = 20;

export const LIST_INSET = "-mx-2";
export const FILES_CONTENT_COLUMN = "w-full px-6";
const ROW_PAD_X = "px-2";

export function colGrid(): string {
  return "minmax(180px,1fr) minmax(96px,116px) minmax(64px,80px) 44px";
}

export const ROW_CLASS = cn(
  "group/row h-10 cursor-default select-none items-center rounded-lg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus",
  ROW_PAD_X,
);

export const ROW_CHECKED = "bg-chip-subtle";

export const HEADER_ROW = cn("h-8 shrink-0 select-none", ROW_PAD_X);

export const NAME_TEXT = "text-sm font-medium text-ink";
export const META_TEXT = "text-xs text-ink-muted";

export const META_CELL = cn(
  "flex h-full items-center justify-end px-2 tabular-nums",
  META_TEXT,
);

export const ACTIONS_CELL = "flex h-full items-center justify-center";

export const NAME_CELL_INNER =
  "flex h-full min-w-0 flex-1 items-center gap-2 pr-1.5";

export const ROW_MARK = "flex size-6 shrink-0 items-center justify-center";

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
