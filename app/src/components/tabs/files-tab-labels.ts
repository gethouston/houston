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
    columnDateCreated: t("files.columns.dateCreated"),
    columnSize: t("files.columns.size"),
    columnKind: t("files.columns.kind"),
    loading: t("files.loading"),
    browseFiles: t("files.browseFiles"),
    viewGrid: t("files.viewGrid"),
    viewList: t("files.viewList"),
    sortBy: t("files.sortBy"),
    newFolder: t("files.newFolder"),
    newFolderPlaceholder: t("files.newFolderPlaceholder"),
    emptyFolder: t("files.emptyFolder"),
    itemSingular: t("files.itemSingular"),
    itemPlural: t("files.itemPlural"),
    menuButton: t("files.menuButton"),
    breadcrumbs: t("files.breadcrumbs"),
    uploadFiles: t("files.uploadFiles"),
    openInFileManager: t("files.openInFileManager"),
    downloadAll: t("files.downloadAll"),
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
