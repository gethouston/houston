import type { FilesSelectionLabels } from "./files-selection";

export interface FilesBrowserLabels {
  columnName?: string;
  columnDateModified?: string;
  columnSize?: string;
  modifiedToday?: string;
  loading?: string;
  newFolder?: string;
  newFolderPlaceholder?: string;
  emptyFolder?: string;
  emptyFolderUploadCta?: string;
  emptyFolderNewFolderCta?: string;
  itemSingular?: string;
  itemPlural?: string;
  menuButton?: string;
  uploadFiles?: string;
  uploadFolder?: string;
  uploadingBusy?: string;
  searchPlaceholder?: string;
  searchClear?: string;
  searchNoResults?: string;
  selectRow?: string;
  selectAll?: string;
  selectedCount?: (count: number) => string;
  deleteSelected?: string;
  clearSelection?: string;
}

export function toColumnLabels(l: Required<FilesBrowserLabels>) {
  return {
    columnName: l.columnName,
    columnDateModified: l.columnDateModified,
    columnSize: l.columnSize,
  };
}

export function toSelectionLabels(
  l: Required<FilesBrowserLabels>,
): FilesSelectionLabels {
  return {
    selectRow: l.selectRow,
    selectAll: l.selectAll,
    selectedCount: l.selectedCount,
    deleteSelected: l.deleteSelected,
    clearSelection: l.clearSelection,
  };
}

export const DEFAULT_FILES_BROWSER_LABELS: Required<FilesBrowserLabels> = {
  columnName: "Name",
  columnDateModified: "Modified",
  columnSize: "Size",
  modifiedToday: "Today",
  loading: "Loading…",
  newFolder: "New Folder",
  newFolderPlaceholder: "untitled folder",
  emptyFolder: "This folder is empty",
  emptyFolderUploadCta: "Upload files",
  emptyFolderNewFolderCta: "New folder",
  itemSingular: "item",
  itemPlural: "items",
  menuButton: "More actions",
  uploadFiles: "Upload files",
  uploadFolder: "Upload folder",
  uploadingBusy: "Uploading…",
  searchPlaceholder: "Search files",
  searchClear: "Clear search",
  searchNoResults: "No files match your search",
  selectRow: "Select",
  selectAll: "Select all",
  selectedCount: (count) => `${count} selected`,
  deleteSelected: "Delete",
  clearSelection: "Clear selection",
};
