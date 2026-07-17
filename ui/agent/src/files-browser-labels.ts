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
  loading?: string;
  browseFiles?: string;
  viewGrid?: string;
  viewList?: string;
  sortBy?: string;
  newFolder?: string;
  newFolderPlaceholder?: string;
  emptyFolder?: string;
  itemSingular?: string;
  itemPlural?: string;
  menuButton?: string;
  /** Accessible name for the breadcrumb navigation. */
  breadcrumbs?: string;
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
  };
}

export function toGridLabels(l: Required<FilesBrowserLabels>) {
  return {
    emptyFolder: l.emptyFolder,
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
  loading: "Loading…",
  browseFiles: "Browse files",
  viewGrid: "Grid view",
  viewList: "List view",
  sortBy: "Sort by",
  newFolder: "New Folder",
  newFolderPlaceholder: "untitled folder",
  emptyFolder: "This folder is empty",
  itemSingular: "item",
  itemPlural: "items",
  menuButton: "More actions",
  breadcrumbs: "Folder path",
};
