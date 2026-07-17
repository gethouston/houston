/**
 * Finder-style list view (extracted from FilesBrowser): sortable column
 * headers, tree rows, filler stripes. The grid view lives in files-grid.tsx.
 */
import type { FileMenuLabels } from "./file-menu";
import { COL_GRID, FileRow } from "./file-row";
import { FillerStripes, HeaderCell } from "./files-list-chrome";
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
  fileCount,
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
  onBackgroundInteraction,
  columnLabels,
  menuLabels,
}: {
  tree: FolderNode;
  fileCount: number;
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
  /** Background click deselects; background right-click opens the New Folder menu. */
  onBackgroundInteraction: (menuPosition?: { x: number; y: number }) => void;
  columnLabels: FilesListColumnLabels;
  menuLabels?: FileMenuLabels;
}) {
  return (
    <>
      <div className="h-[24px] shrink-0 select-none items-center border-b border-line bg-chip-subtle/40 px-1">
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
            last
          />
        </div>
      </div>
      <div className="shrink-0 px-1 [&>:nth-child(even)]:rounded-lg [&>:nth-child(even)]:bg-chip-subtle/30">
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
      <FillerStripes
        startIndex={fileCount}
        onDeselect={() => onBackgroundInteraction()}
        onContextMenu={
          onCreateFolder
            ? (e) => {
                e.preventDefault();
                onBackgroundInteraction({ x: e.clientX, y: e.clientY });
              }
            : undefined
        }
      />
    </>
  );
}
