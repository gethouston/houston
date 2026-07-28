/**
 * Drive-style card grid for one folder level. Folders first, then files
 * (both pre-sorted by the caller). Renders the inline new-folder card. The
 * empty-folder and empty-search states belong to FilesBody, which hoists them
 * above the view switch so the list view gets them too.
 */
import { FileCard } from "./file-card";
import type { FileMenuLabels } from "./file-menu";
import { folderChildCount } from "./filter";
import { FolderCard } from "./folder-card";
import { NewFolderCard } from "./new-folder-card";
import type { FolderNode } from "./tree";
import type { FileEntry, LoadFilePreview } from "./types";

export interface FilesGridLabels {
  newFolderPlaceholder: string;
  itemSingular: string;
  itemPlural: string;
  menuButton?: string;
}

export function FilesGrid({
  folder,
  selectedPath,
  loadPreview,
  onNavigate,
  onSelect,
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
  selectedPath?: string | null;
  loadPreview?: LoadFilePreview;
  onNavigate: (path: string) => void;
  onSelect?: (file: FileEntry) => void;
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
  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] content-start gap-3 pt-1">
      {creatingFolder && onCreateFolder && (
        <NewFolderCard
          onConfirm={onCreateFolder}
          onCancel={onCancelCreateFolder}
          placeholder={labels.newFolderPlaceholder}
        />
      )}
      {folder.children.map((child) =>
        child.kind === "folder" ? (
          <FolderCard
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
        ) : (
          <FileCard
            key={child.entry.path}
            file={child.entry}
            selected={selectedPath === child.entry.path}
            loadPreview={loadPreview}
            onSelect={onSelect}
            onOpen={onOpen}
            onReveal={onReveal}
            onDownload={onDownload}
            onDelete={onDelete}
            onRename={onRename}
            onMove={onMove}
            menuLabels={menuLabels}
            menuButtonLabel={labels.menuButton}
          />
        ),
      )}
    </div>
  );
}

/** A folder's TRUE size: a search prunes children, it never shrinks a folder. */
function itemsLabel(node: FolderNode, labels: FilesGridLabels): string {
  const count = folderChildCount(node);
  return `${count} ${count === 1 ? labels.itemSingular : labels.itemPlural}`;
}
