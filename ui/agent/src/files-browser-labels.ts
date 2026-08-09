/**
 * Chrome labels for FilesBrowser (columns, toolbar, selection). Consumers pass
 * translated strings; English defaults keep the component standalone. Counted
 * copy arrives as a FUNCTION of the count, never as a template string — the
 * app owns pluralization, this package owns none of it.
 */
import type { FilesSelectionLabels } from "./files-selection";

export interface FilesBrowserLabels {
  columnName?: string;
  columnDateModified?: string;
  columnSize?: string;
  /** The Modified cell's word for a file changed today (list view). */
  modifiedToday?: string;
  loading?: string;
  newFolder?: string;
  newFolderPlaceholder?: string;
  emptyFolder?: string;
  /** Empty-folder CTAs beneath the notice (grid view). */
  emptyFolderUploadCta?: string;
  emptyFolderNewFolderCta?: string;
  /** Folder-card child count (grid view), pluralized against the count. */
  itemSingular?: string;
  itemPlural?: string;
  menuButton?: string;
  /** Header action labels (promoted from the old status-bar footer). */
  uploadFiles?: string;
  /** Menu item / empty-state CTA for uploading a whole folder (HOU-889). */
  uploadFolder?: string;
  /** Busy label on the upload actions while an upload is in flight. */
  uploadingBusy?: string;
  /** Header search field: placeholder, clear button, empty-result notice. */
  searchPlaceholder?: string;
  searchClear?: string;
  searchNoResults?: string;
  /** List-view multi-selection (only rendered when onDeleteMany is passed). */
  selectRow?: string;
  selectAll?: string;
  /** A FUNCTION, not a string: pluralizing "3 selected" belongs to the app's
   *  translator, so this package never has to know a language's plural rules.
   *  Same shape as BulkActionBarLabels.selected in @houston-ai/board. */
  selectedCount?: (count: number) => string;
  deleteSelected?: string;
  clearSelection?: string;
}

/** Slice the flat label bag into the shapes the subcomponents take. */
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
