/**
 * The quiet row under a folder expanded onto nothing. Expansion is how the
 * list browses, so an open chevron over blank space would read as a listing
 * that failed to load; this says the folder is simply empty. It is a full row
 * of the column grid — same gutter, same indent — so nothing beneath it jogs
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
  selectable,
}: {
  /** Depth of the CHILD level, i.e. where the missing rows would have sat. */
  depth: number;
  label?: string;
  selectable: boolean;
}) {
  return (
    <div
      className={cn(ROW_CLASS, "hover:bg-transparent", META_TEXT)}
      style={{ display: "grid", gridTemplateColumns: colGrid(selectable) }}
    >
      {selectable && <span />}
      <div className="flex h-full min-w-0 items-center">
        <RowIndent depth={depth} chevron />
        <div className={NAME_CELL_INNER}>{label}</div>
      </div>
      <span className={META_CELL} />
      <span className={META_CELL} />
      <span className={ACTIONS_CELL} />
    </div>
  );
}
