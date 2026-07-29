/**
 * Chrome labels for FilesBrowser (columns, toolbar, status bar). Consumers
 * pass translated strings; English defaults keep the component standalone.
 */

export interface FilesBrowserLabels {
  columnName?: string;
  columnDateModified?: string;
  columnDateCreated?: string;
  columnSize?: string;
  columnKind?: string;
  /** The Kind column's word for a folder row (list view). */
  kindFolder?: string;
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
  /** Header action labels (promoted from the old status-bar footer). */
  uploadFiles?: string;
  /** The Upload pill when it opens the files/folder menu (HOU-889). */
  upload?: string;
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
}

/** Slice the flat label bag into the shapes the subcomponents take. */
export function toSortLabels(l: Required<FilesBrowserLabels>) {
  return {
    sortBy: l.sortBy,
    name: l.columnName,
    dateModified: l.columnDateModified,
    dateCreated: l.columnDateCreated,
    size: l.columnSize,
    kind: l.columnKind,
  };
}

export function toColumnLabels(l: Required<FilesBrowserLabels>) {
  return {
    columnName: l.columnName,
    columnDateModified: l.columnDateModified,
    columnDateCreated: l.columnDateCreated,
    columnSize: l.columnSize,
    columnKind: l.columnKind,
    kindFolder: l.kindFolder,
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
  columnDateModified: "Date Modified",
  columnDateCreated: "Date Created",
  columnSize: "Size",
  columnKind: "Kind",
  kindFolder: "Folder",
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
  uploadFiles: "Upload files",
  upload: "Upload",
  uploadFolder: "Upload folder",
  openInFileManager: "Open in File Manager",
  downloadAll: "Download all",
  dropHint: "or drag and drop files here",
  uploadingBusy: "Uploading…",
  searchPlaceholder: "Search files",
  searchClear: "Clear search",
  searchNoResults: "No files match your search",
};
