import { cn } from "@houston-ai/core";
import { LIST_INSET, type ListRowCallbacks } from "./files-list-chrome";
import { FilesSelectionBar } from "./files-selection-bar";
import { ListRows } from "./list-rows";
import { NewFolderInput } from "./new-folder-input";
import type { FolderNode } from "./tree";

export function FilesListView({
  tree,
  creatingFolder,
  onCreateFolder,
  onCancelCreateFolder,
  newFolderPlaceholder,
  depth = 0,
  ...rows
}: ListRowCallbacks & {
  tree: FolderNode;
  creatingFolder: boolean;
  onCreateFolder?: (name: string) => void;
  onCancelCreateFolder: () => void;
  newFolderPlaceholder: string;
  depth?: number;
}) {
  const { selection } = rows;

  return (
    <div className={cn("flex flex-col", LIST_INSET)}>
      {selection && selection.paths.size > 0 && (
        <FilesSelectionBar selection={selection} />
      )}
      <div className="shrink-0">
        {creatingFolder && onCreateFolder && (
          <NewFolderInput
            onConfirm={onCreateFolder}
            onCancel={onCancelCreateFolder}
            placeholder={newFolderPlaceholder}
          />
        )}
        <ListRows {...rows} nodes={tree.children} depth={depth} />
      </div>
    </div>
  );
}
