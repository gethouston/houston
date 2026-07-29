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
  browseFiles?: string;
  viewGrid?: string;
  viewList?: string;
  sortBy?: string;
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
  /** Accessible name for the breadcrumb navigation. */
  breadcrumbs?: string;
  /** The toolbar's one filled pill: everything that ADDS to the workspace. */
  newMenu?: string;
  /** Header action labels (promoted from the old status-bar footer). */
  uploadFiles?: string;
  /** Menu item / empty-state CTA for uploading a whole folder (HOU-889). */
  uploadFolder?: string;
  openInFileManager?: string;
  downloadAll?: string;
  /** Empty-state hint that the zero-files screen also accepts a drop. */
  dropHint?: string;
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
export function toSortLabels(l: Required<FilesBrowserLabels>) {
  return {
    sortBy: l.sortBy,
    name: l.columnName,
    dateModified: l.columnDateModified,
    size: l.columnSize,
  };
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

export function toGridLabels(l: Required<FilesBrowserLabels>) {
  return {
    newFolderPlaceholder: l.newFolderPlaceholder,
    itemSingular: l.itemSingular,
    itemPlural: l.itemPlural,
    menuButton: l.menuButton,
  };
}

export const DEFAULT_FILES_BROWSER_LABELS: Required<FilesBrowserLabels> = {
  columnName: "Name",
  columnDateModified: "Modified",
  columnSize: "Size",
  modifiedToday: "Today",
  loading: "Loading…",
  browseFiles: "Browse files",
  viewGrid: "Grid view",
  viewList: "List view",
  sortBy: "Sort by",
  newFolder: "New Folder",
  newFolderPlaceholder: "untitled folder",
  emptyFolder: "This folder is empty",
  emptyFolderUploadCta: "Upload files",
  emptyFolderNewFolderCta: "New folder",
  itemSingular: "item",
  itemPlural: "items",
  menuButton: "More actions",
  breadcrumbs: "Folder path",
  newMenu: "New",
  uploadFiles: "Upload files",
  uploadFolder: "Upload folder",
  openInFileManager: "Open in File Manager",
  downloadAll: "Download all",
  dropHint: "or drag and drop files here",
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
