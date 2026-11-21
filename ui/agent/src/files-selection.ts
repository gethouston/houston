import type { FolderNode } from "./tree";
import type { FileEntry } from "./types";

export interface FilesSelectionLabels {
  selectRow: string;
  selectAll: string;
  selectedCount: (count: number) => string;
  deleteSelected: string;
  clearSelection: string;
}

export interface FilesSelection {
  paths: ReadonlySet<string>;
  toggle: (path: string) => void;
  visiblePaths: string[];
  toggleAll: () => void;
  clear: () => void;
  onDeleteSelected: () => void;
  labels: FilesSelectionLabels;
}

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

export interface FilesSelectionSource {
  selectedPaths: ReadonlySet<string>;
  selectedFiles: FileEntry[];
  toggleSelected: (path: string) => void;
  toggleAllSelected: (paths: string[]) => void;
  clearSelection: () => void;
  visibleFolder: FolderNode | null;
}

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
