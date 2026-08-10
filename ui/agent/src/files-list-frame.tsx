/** Shared column band for a team Files list. */
import { cn } from "@houston-ai/core";
import {
  BASE_INDENT,
  colGrid,
  HEADER_ROW,
  HeaderCell,
  LIST_INSET,
  TRIANGLE_AREA,
} from "./files-list-chrome";
import type { SortDirection, SortKey } from "./utils";

export interface FilesColumnLabels {
  columnName: string;
  columnDateModified: string;
  columnSize: string;
}

export function FilesColumnBand({
  labels,
  sortKey,
  sortDir,
  onSort,
}: {
  labels: FilesColumnLabels;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: CSS grid preserves the shared column geometry; the sortable buttons remain the focusable controls.
    <div
      role="row"
      className={cn("min-w-0 items-center", HEADER_ROW, LIST_INSET)}
      style={{ display: "grid", gridTemplateColumns: colGrid() }}
    >
      <HeaderCell
        label={labels.columnName}
        col="name"
        {...{ sortKey, sortDir, onSort }}
        style={{ paddingLeft: BASE_INDENT + TRIANGLE_AREA }}
      />
      <HeaderCell
        label={labels.columnDateModified}
        col="dateModified"
        {...{ sortKey, sortDir, onSort }}
        className="justify-end"
      />
      <HeaderCell
        label={labels.columnSize}
        col="size"
        {...{ sortKey, sortDir, onSort }}
        className="justify-end"
      />
      <span />
    </div>
  );
}
