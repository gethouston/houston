/**
 * List-view chrome shared by the header row, the file/folder rows and the
 * skeleton: the column grid, the row indent constants, the quiet sortable
 * header cell and the disclosure chevron.
 */
import { cn } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import type { FileMenuLabels } from "./file-menu";
import type { FileEntry } from "./types";
import type { SortDirection, SortKey } from "./utils";

/**
 * The callbacks and labels every list row forwards down the tree unchanged.
 * Rows pass them on as one bag, so a new row capability never has to be
 * threaded through each level of the recursion by hand.
 */
export interface ListRowCallbacks {
  selectedPath?: string | null;
  onSelect?: (file: FileEntry) => void;
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
  /** The Kind column's word for a folder row. */
  kindFolderLabel: string;
  menuLabels?: FileMenuLabels;
  /** Accessible name for the always-visible kebab buttons. */
  menuButtonLabel?: string;
}

export const DEPTH_INDENT = 20;
export const BASE_INDENT = 12;
export const TRIANGLE_AREA = 16;

/**
 * Column grid shared between the header, the rows and the skeleton. The
 * trailing track is the actions column: every row's kebab sits there, at the
 * row's end, aligned with the one above it.
 */
export const COL_GRID = "1fr 160px 160px 80px 130px 40px";

/** Row cell classes for the quiet, column-aligned metadata. */
export const META_CELL = "truncate px-2 text-xs text-ink-muted tabular-nums";

export function HeaderCell({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={cn(
        "flex h-full items-center justify-between rounded-sm px-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
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
  );
}

/** Folder-row expand/collapse indicator (rotates a quarter turn when open). */
export function DisclosureChevron({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "size-3.5 shrink-0 text-ink-muted transition-transform duration-150",
        open && "rotate-90",
        className,
      )}
    />
  );
}
