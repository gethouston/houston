/**
 * Translated label bundles for the FilesBrowser chrome and context menu
 * (ui/ components are i18n-agnostic and take labels as props).
 */
import type { FileMenuLabels, FilesBrowserLabels } from "@houston-ai/agent";
import type { TFunction } from "i18next";

export function buildBrowserLabels(t: TFunction<"agents">): FilesBrowserLabels {
  return {
    columnName: t("files.columns.name"),
    columnDateModified: t("files.columns.dateModified"),
    columnSize: t("files.columns.size"),
    modifiedToday: t("files.modifiedToday"),
    loading: t("files.loading"),
    browseFiles: t("files.browseFiles"),
    viewGrid: t("files.viewGrid"),
    viewList: t("files.viewList"),
    sortBy: t("files.sortBy"),
    newMenu: t("files.newMenu"),
    newFolder: t("files.newFolder"),
    newFolderPlaceholder: t("files.newFolderPlaceholder"),
    emptyFolder: t("files.emptyFolder"),
    itemSingular: t("files.itemSingular"),
    itemPlural: t("files.itemPlural"),
    menuButton: t("files.menuButton"),
    breadcrumbs: t("files.breadcrumbs"),
    uploadFiles: t("files.uploadFiles"),
    uploadFolder: t("files.uploadFolder"),
    openInFileManager: t("files.openInFileManager"),
    downloadAll: t("files.downloadAll"),
    dropHint: t("files.dropHint"),
    uploadingBusy: t("files.uploadingBusy"),
    // The empty-folder CTAs say exactly what the header actions say; one
    // string per phrase keeps them from drifting apart in translation.
    emptyFolderUploadCta: t("files.uploadFiles"),
    emptyFolderNewFolderCta: t("files.newFolder"),
    searchPlaceholder: t("files.searchPlaceholder"),
    searchClear: t("files.searchClear"),
    searchNoResults: t("files.searchNoResults"),
    selectRow: t("files.selectRow"),
    selectAll: t("files.selectAll"),
    // A function, not a string: the count is only known inside the list view,
    // so the library calls back for the copy and pluralization stays app-side
    // (same contract as `BulkActionBarLabels.selected` on the board).
    selectedCount: (count: number) => t("files.selectedCount", { count }),
    deleteSelected: t("files.deleteSelected"),
    clearSelection: t("files.clearSelection"),
  };
}

export function buildMenuLabels(
  t: TFunction<"agents">,
  canUseLocalFiles: boolean,
): FileMenuLabels {
  return {
    open: canUseLocalFiles ? t("files.menu.open") : t("files.menu.preview"),
    rename: t("files.menu.rename"),
    reveal: t("files.menu.reveal"),
    download: t("files.menu.download"),
    delete: t("files.menu.delete"),
  };
}
