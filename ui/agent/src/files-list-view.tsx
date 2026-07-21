/**
 * Flat list view: quiet sortable column headers over the tree rows. The grid
 * view lives in files-grid.tsx.
 */
import type { FileMenuLabels } from "./file-menu";
import { COL_GRID, FileRow } from "./file-row";
import { HeaderCell } from "./files-list-chrome";
import { FolderSection } from "./folder-section";
import { NewFolderInput } from "./new-folder-input";
import type { FolderNode } from "./tree";
import type { FileEntry } from "./types";
import type { SortDirection, SortKey } from "./utils";

export interface FilesListColumnLabels {
  columnName: string;
  columnDateModified: string;
  columnDateCreated: string;
  columnSize: string;
  columnKind: string;
}

export function FilesListView({
  tree,
  sortKey,
  sortDir,
  onSort,
  selectedPath,
  onSelect,
  onOpen,
  onReveal,
  onDownload,
  onDownloadFolder,
  onDelete,
  onRename,
  onFilesDropped,
  onDragActive,
  onMove,
  creatingFolder,
  onCreateFolder,
  onCancelCreateFolder,
  newFolderPlaceholder,
  columnLabels,
  menuLabels,
}: {
  tree: FolderNode;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  selectedPath?: string | null;
  onSelect: (file: FileEntry) => void;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  onDownload?: (file: FileEntry) => void;
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  onDragActive: (folder: string | null) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  creatingFolder: boolean;
  onCreateFolder?: (name: string) => void;
  onCancelCreateFolder: () => void;
  newFolderPlaceholder: string;
  columnLabels: FilesListColumnLabels;
  menuLabels?: FileMenuLabels;
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
        </div>
      </div>
      <div className="shrink-0 pt-1">
        {creatingFolder && onCreateFolder && (
          <NewFolderInput
            onConfirm={onCreateFolder}
            onCancel={onCancelCreateFolder}
            placeholder={newFolderPlaceholder}
          />
        )}
        {tree.children.map((child) =>
          child.kind === "folder" ? (
            <FolderSection
              key={child.path}
              node={child}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onOpen={onOpen}
              onReveal={onReveal}
              onDownload={onDownload}
              onDownloadFolder={onDownloadFolder}
              onDelete={onDelete}
              onRename={onRename}
              onFilesDropped={onFilesDropped}
              onDragActive={onDragActive}
              onMove={onMove}
              menuLabels={menuLabels}
            />
          ) : (
            <FileRow
              key={child.entry.path}
              file={child.entry}
              selected={selectedPath === child.entry.path}
              onSelect={onSelect}
              onOpen={onOpen}
              onReveal={onReveal}
              onDownload={onDownload}
              onDelete={onDelete}
              onRename={onRename}
              onMove={onMove}
              menuLabels={menuLabels}
            />
          ),
        )}
      </div>
    </>
  );
}
