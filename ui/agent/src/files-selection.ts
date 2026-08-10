/**
 * The list view's multi-selection contract. Selecting is a CHECKBOX act here,
 * never a click: a click on a row opens the file, so the only way into a
 * selection is the checkbox in every file row's tree slot. Folders are
 * deliberately not selectable — deleting a folder is a heavier act than
 * deleting a batch of files and stays on its own menu.
 *
 * One object carries the whole capability down FilesBrowser → FilesBody →
 * FilesListView → the rows, and its very PRESENCE is the feature switch: the
 * browser builds it only when the consumer passed `onDeleteMany`, so a browser
 * with nothing to do with a selection renders empty tree slots.
 * No React here.
 */
import type { FolderNode } from "./tree";
import type { FileEntry } from "./types";

export interface FilesSelectionLabels {
  /** Accessible name of one row's checkbox. */
  selectRow: string;
  /** Accessible name of the header / selection-bar checkbox. */
  selectAll: string;
  /** A FUNCTION, not a string: pluralizing "3 selected" is the app's job (it
   *  passes a `t()` closure), so this package stays language-free. */
  selectedCount: (count: number) => string;
  deleteSelected: string;
  clearSelection: string;
}

export interface FilesSelection {
  /** Paths currently checked. */
  paths: ReadonlySet<string>;
  toggle: (path: string) => void;
  /** Every selectable (file) path the list currently renders, in order. */
  visiblePaths: string[];
  toggleAll: () => void;
  clear: () => void;
  onDeleteSelected: () => void;
  labels: FilesSelectionLabels;
}

/**
 * Every non-directory path in a (filtered) tree, depth-first, in the order the
 * list renders them. Fed the SEARCH-FILTERED tree on purpose: "select all"
 * means the rows you can see, never the ones a query pruned away.
 */
export function collectFilePaths(node: FolderNode): string[] {
  const paths: string[] = [];
  const walk = (folder: FolderNode) => {
    for (const child of folder.children) {
      if (child.kind === "folder") walk(child);
      else paths.push(child.entry.path);
    }
  };
  walk(node);
  return paths;
}

/** The parts of `useFilesBrowser` a selection is assembled from. */
export interface FilesSelectionSource {
  selectedPaths: ReadonlySet<string>;
  selectedFiles: FileEntry[];
  toggleSelected: (path: string) => void;
  toggleAllSelected: (paths: string[]) => void;
  clearSelection: () => void;
  /** The SEARCH-FILTERED root of the current view; null while loading. */
  visibleFolder: FolderNode | null;
}

/**
 * Assemble the capability object, or return undefined when there is no bulk
 * handler to serve — which is exactly how the row checkboxes switch off.
 * "Select all" spans the rows the search currently leaves on screen, never the
 * ones it pruned away.
 */
export function buildFilesSelection(
  source: FilesSelectionSource,
  onDeleteMany: ((files: FileEntry[]) => void) | undefined,
  labels: FilesSelectionLabels,
): FilesSelection | undefined {
  if (!onDeleteMany) return undefined;
  const visiblePaths = source.visibleFolder
    ? collectFilePaths(source.visibleFolder)
    : [];
  return {
    paths: source.selectedPaths,
    toggle: source.toggleSelected,
    visiblePaths,
    toggleAll: () => source.toggleAllSelected(visiblePaths),
    clear: source.clearSelection,
    onDeleteSelected: () => onDeleteMany(source.selectedFiles),
    labels,
  };
}
