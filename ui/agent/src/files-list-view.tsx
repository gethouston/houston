/**
 * Flat list view: quiet sortable column headers over the recursive rows of the
 * open folder (the header's breadcrumb states which folder that is). The grid
 * view lives in files-grid.tsx.
 */
import {
  COL_GRID,
  HeaderCell,
  type ListRowCallbacks,
} from "./files-list-chrome";
import { ListRows } from "./folder-section";
import { NewFolderInput } from "./new-folder-input";
import type { FolderNode } from "./tree";
import type { SortDirection, SortKey } from "./utils";

export interface FilesListColumnLabels {
  columnName: string;
  columnDateModified: string;
  columnDateCreated: string;
  columnSize: string;
  columnKind: string;
  /** The Kind column's word for a folder row. */
  kindFolder: string;
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
}: Omit<ListRowCallbacks, "kindFolderLabel"> & {
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
  return (
    <>
      <div className="h-8 shrink-0 select-none items-center border-b border-line">
        <div
          className="h-full min-w-0 items-center"
          style={{ display: "grid", gridTemplateColumns: COL_GRID }}
        >
          <HeaderCell
            label={columnLabels.columnName}
            col="name"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            className="pl-7"
          />
          <HeaderCell
            label={columnLabels.columnDateModified}
            col="dateModified"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
          />
          <HeaderCell
            label={columnLabels.columnDateCreated}
            col="dateCreated"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
          />
          <HeaderCell
            label={columnLabels.columnSize}
            col="size"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
          />
          <HeaderCell
            label={columnLabels.columnKind}
            col="kind"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
          />
          {/* The rows' actions column: nothing to sort, nothing to label. */}
          <span />
        </div>
      </div>
      <div className="shrink-0 pt-1">
        {creatingFolder && onCreateFolder && (
          <NewFolderInput
            onConfirm={onCreateFolder}
            onCancel={onCancelCreateFolder}
            placeholder={newFolderPlaceholder}
            kindFolderLabel={columnLabels.kindFolder}
          />
        )}
        <ListRows
          {...rows}
          nodes={tree.children}
          depth={0}
          kindFolderLabel={columnLabels.kindFolder}
        />
      </div>
    </>
  );
}
