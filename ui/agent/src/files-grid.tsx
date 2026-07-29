/**
 * Drive-style card grid for one folder level, in two groups: the folders as
 * one-line chips (the inline new-folder affordance belongs with them), then
 * the files as hero preview cards. No headings — the grouping is the layout.
 * Both groups are auto-fill grids, so they fill the pane's whole width at any
 * size. The empty-folder and empty-search states belong to FilesBody, which
 * hoists them above the view switch so the list view gets them too.
 */
import { FileCard } from "./file-card";
import type { FileMenuLabels } from "./file-menu";
import { folderChildCount } from "./filter";
import { FolderChip } from "./folder-chip";
import { NewFolderChip } from "./new-folder-chip";
import type { FolderNode } from "./tree";
import type { FileEntry, LoadFilePreview } from "./types";

export interface FilesGridLabels {
  newFolderPlaceholder: string;
  itemSingular: string;
  itemPlural: string;
  menuButton?: string;
}

/** Chips are narrower than cards: a folder is one line, a file is a preview. */
const CHIP_GRID = "grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]";
const CARD_GRID = "grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]";

export function FilesGrid({
  folder,
  loadPreview,
  onNavigate,
  onOpen,
  onReveal,
  onDownload,
  onDownloadFolder,
  onDelete,
  onRename,
  onMove,
  onDragActive,
  creatingFolder,
  onCreateFolder,
  onCancelCreateFolder,
  menuLabels,
  labels,
}: {
  folder: FolderNode;
  loadPreview?: LoadFilePreview;
  onNavigate: (path: string) => void;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  onDownload?: (file: FileEntry) => void;
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  onDragActive?: (folder: string | null) => void;
  creatingFolder: boolean;
  onCreateFolder?: (name: string) => void;
  onCancelCreateFolder: () => void;
  menuLabels?: FileMenuLabels;
  labels: FilesGridLabels;
}) {
  const folders = folder.children.filter((c) => c.kind === "folder");
  const files = folder.children.filter((c) => c.kind === "file");
  const creating = creatingFolder && onCreateFolder;

  return (
    <div className="flex shrink-0 flex-col gap-6 pt-1">
      {(creating || folders.length > 0) && (
        <div className={`grid ${CHIP_GRID} content-start gap-3`}>
          {creating && (
            <NewFolderChip
              onConfirm={onCreateFolder}
              onCancel={onCancelCreateFolder}
              placeholder={labels.newFolderPlaceholder}
            />
          )}
          {folders.map((child) => (
            <FolderChip
              key={child.path}
              node={child}
              onNavigate={onNavigate}
              onDownloadFolder={onDownloadFolder}
              onDelete={onDelete}
              onRename={onRename}
              onMove={onMove}
              onDragActive={onDragActive}
              menuLabels={menuLabels}
              menuButtonLabel={labels.menuButton}
              itemsLabel={itemsLabel(child, labels)}
            />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={`grid ${CARD_GRID} content-start gap-4`}>
          {files.map((child) => (
            <FileCard
              key={child.entry.path}
              file={child.entry}
              loadPreview={loadPreview}
              onOpen={onOpen}
              onReveal={onReveal}
              onDownload={onDownload}
              onDelete={onDelete}
              onRename={onRename}
              onMove={onMove}
              menuLabels={menuLabels}
              menuButtonLabel={labels.menuButton}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A folder's TRUE size: a search prunes children, it never shrinks a folder. */
function itemsLabel(node: FolderNode, labels: FilesGridLabels): string {
  const count = folderChildCount(node);
  return `${count} ${count === 1 ? labels.itemSingular : labels.itemPlural}`;
}
