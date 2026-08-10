/**
 * The quiet row under a folder expanded onto nothing. Expansion is how the
 * list browses, so an open chevron over blank space would read as a listing
 * that failed to load; this says the folder is simply empty. It is a full row
 * of the column grid — same indent and columns — so nothing beneath it jogs
 * sideways. It is not hoverable: there is nothing here to act on.
 */
import { cn } from "@houston-ai/core";
import {
  ACTIONS_CELL,
  colGrid,
  META_CELL,
  META_TEXT,
  NAME_CELL_INNER,
  ROW_CLASS,
} from "./files-list-chrome";
import { RowIndent } from "./files-list-indent";

export function FolderEmptyRow({
  depth,
  label,
  onUpload,
  uploadLabel,
  onNewFolder,
  newFolderLabel,
}: {
  /** Depth of the CHILD level, i.e. where the missing rows would have sat. */
  depth: number;
  label?: string;
  onUpload?: () => void;
  uploadLabel?: string;
  onNewFolder?: () => void;
  newFolderLabel?: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: CSS-grid row with focusable inline actions; the empty row itself has no action.
    <div
      role="row"
      className={cn(ROW_CLASS, "hover:bg-transparent", META_TEXT)}
      style={{ display: "grid", gridTemplateColumns: colGrid() }}
    >
      <div className="flex h-full min-w-0 items-center">
        <RowIndent depth={depth} chevron />
        <div className={NAME_CELL_INNER}>
          <span>{label}</span>
          {onUpload && (
            <button
              type="button"
              className={cn(
                META_TEXT,
                "flex h-6 items-center rounded-sm px-1 underline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              )}
              onClick={onUpload}
            >
              {uploadLabel}
            </button>
          )}
          {onNewFolder && (
            <button
              type="button"
              className={cn(
                META_TEXT,
                "flex h-6 items-center rounded-sm px-1 underline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              )}
              onClick={onNewFolder}
            >
              {newFolderLabel}
            </button>
          )}
        </div>
      </div>
      <span className={META_CELL} />
      <span className={META_CELL} />
      <span className={ACTIONS_CELL} />
    </div>
  );
}
