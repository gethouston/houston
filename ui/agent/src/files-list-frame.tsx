/** Shared column band and top-level accordion row for a team Files list. */
import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import {
  BASE_INDENT,
  colGrid,
  HEADER_ROW,
  HeaderCell,
  LIST_INSET,
  META_CELL,
  NAME_CELL_INNER,
  NAME_TEXT,
  ROW_CLASS,
  TRIANGLE_AREA,
} from "./files-list-chrome";
import { DisclosureChevron } from "./files-list-indent";
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
      style={{ display: "grid", gridTemplateColumns: colGrid(false) }}
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

export function FilesAgentRow({
  name,
  avatar,
  expanded,
  onToggle,
  actions,
  expandLabel,
  collapseLabel,
}: {
  name: string;
  avatar: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  expandLabel: string;
  collapseLabel: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: CSS grid preserves the shared column geometry; the disclosure and actions remain the focusable controls.
    <div
      role="row"
      className={cn(ROW_CLASS, LIST_INSET)}
      style={{ display: "grid", gridTemplateColumns: colGrid(false) }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? collapseLabel : expandLabel}
        onClick={onToggle}
        className="flex h-full min-w-0 items-center text-left focus-visible:outline-none"
      >
        <DisclosureChevron open={expanded} className="mr-2" />
        <span className={NAME_CELL_INNER}>
          {avatar}
          <span className={cn("truncate", NAME_TEXT)}>{name}</span>
        </span>
      </button>
      <span className={META_CELL} />
      <span className={META_CELL} />
      <span className="flex items-center justify-center">{actions}</span>
    </div>
  );
}
