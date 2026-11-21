import type { FileMenuLabels, FilesBrowserLabels } from "@houston-ai/agent";
import type { TFunction } from "i18next";

export function buildBrowserLabels(t: TFunction<"agents">): FilesBrowserLabels {
  return {
    columnName: t("files.columns.name"),
    columnDateModified: t("files.columns.dateModified"),
    columnSize: t("files.columns.size"),
    modifiedToday: t("files.modifiedToday"),
    loading: t("files.loading"),
    newFolder: t("files.newFolder"),
    newFolderPlaceholder: t("files.newFolderPlaceholder"),
    emptyFolder: t("files.emptyFolder"),
    itemSingular: t("files.itemSingular"),
    itemPlural: t("files.itemPlural"),
    menuButton: t("files.menuButton"),
    uploadFiles: t("files.uploadFiles"),
    uploadFolder: t("files.uploadFolder"),
    uploadingBusy: t("files.uploadingBusy"),
    emptyFolderUploadCta: t("files.uploadFiles"),
    emptyFolderNewFolderCta: t("files.newFolder"),
    searchPlaceholder: t("files.searchPlaceholder"),
    searchClear: t("files.searchClear"),
    searchNoResults: t("files.searchNoResults"),
    selectRow: t("files.selectRow"),
    selectAll: t("files.selectAll"),
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
