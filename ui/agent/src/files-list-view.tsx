/**
 * Recursive rows for one filesystem section. The team-level frame owns the
 * single shared column band; folders expand in place beneath their agent.
 *
 * The list draws no rules at all — not under the column headers and not between
 * the rows. Vertical rhythm is spacing, and the only thing that ever paints is
 * the row under the pointer. While files are checked the header slot hands
 * itself to the selection bar, same height and same padding, so nothing below
 * moves.
 */
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
