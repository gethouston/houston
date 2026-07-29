/**
 * Flat list view: quiet sortable column headers over the recursive rows of the
 * WHOLE workspace. The list has no breadcrumb (that row is the grid's), so
 * expanding a folder row in place is how you browse here — the tree is always
 * rooted at the workspace, whatever folder the grid happens to have open. The
 * grid view lives in files-grid.tsx.
 *
 * The list draws no rules at all — not under the column headers and not between
 * the rows. Vertical rhythm is spacing, and the only thing that ever paints is
 * the row under the pointer. While files are checked the header slot hands
 * itself to the selection bar, same height and same padding, so nothing below
 * moves.
 */
import { cn } from "@houston-ai/core";
import {
  BASE_INDENT,
  colGrid,
  HEADER_ROW,
  HeaderCell,
  LIST_INSET,
  type ListRowCallbacks,
  TRIANGLE_AREA,
} from "./files-list-chrome";
import { FilesSelectionBar, SelectAllCheckbox } from "./files-selection-bar";
import { ListRows } from "./list-rows";
import { NewFolderInput } from "./new-folder-input";
import type { FolderNode } from "./tree";
import type { SortDirection, SortKey } from "./utils";

export interface FilesListColumnLabels {
  columnName: string;
  columnDateModified: string;
  columnSize: string;
}

export function FilesListView({
  tree,
  sortKey,
  sortDir,
  onSort,
  creatingFolder,
  onCreateFolder,
  onCancelCreateFolder,
  newFolderPlaceholder,
  columnLabels,
  ...rows
}: ListRowCallbacks & {
  tree: FolderNode;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  creatingFolder: boolean;
  onCreateFolder?: (name: string) => void;
  onCancelCreateFolder: () => void;
  newFolderPlaceholder: string;
  columnLabels: FilesListColumnLabels;
}) {
  const { selection } = rows;
  const selectable = !!selection;

  return (
    <div className={cn("flex flex-col", LIST_INSET)}>
      {selection && selection.paths.size > 0 ? (
        <FilesSelectionBar selection={selection} />
      ) : (
        <div
          className={cn("min-w-0 items-center", HEADER_ROW)}
          style={{
            display: "grid",
            gridTemplateColumns: colGrid(selectable),
          }}
        >
          {selection && (
            <span className="flex items-center justify-center">
              <SelectAllCheckbox selection={selection} />
            </span>
          )}
          <HeaderCell
            label={columnLabels.columnName}
            col="name"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            // The column's word sits over the item ICONS, not over the indent.
            style={{ paddingLeft: BASE_INDENT + TRIANGLE_AREA }}
          />
          <HeaderCell
            label={columnLabels.columnDateModified}
            col="dateModified"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            className="justify-end"
          />
          <HeaderCell
            label={columnLabels.columnSize}
            col="size"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            className="justify-end"
          />
          {/* The rows' actions column: nothing to sort, nothing to label. */}
          <span />
        </div>
      )}
      <div className="shrink-0">
        {creatingFolder && onCreateFolder && (
          <NewFolderInput
            onConfirm={onCreateFolder}
            onCancel={onCancelCreateFolder}
            placeholder={newFolderPlaceholder}
            selectable={selectable}
          />
        )}
        <ListRows {...rows} nodes={tree.children} depth={0} />
      </div>
    </div>
  );
}
