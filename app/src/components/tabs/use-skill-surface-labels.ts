import { useTranslation } from "react-i18next";

export function useSkillSurfaceLabels() {
  const { t } = useTranslation(["skills", "common"]);

  const skillDetailLabels = {
    notFound: t("skills:detail.notFound"),
    backAria: t("skills:detail.backAria"),
    saveChanges: t("skills:detail.saveChanges"),
    savingChanges: t("skills:detail.savingChanges"),
    moreOptions: t("skills:detail.moreOptions"),
    delete: t("skills:detail.delete"),
    deleteTitle: (name: string) => t("skills:detail.deleteTitle", { name }),
    deleteDescription: t("skills:detail.deleteDescription"),
    deleteConfirmLabel: t("common:actions.delete"),
    instructionsPlaceholder: t("skills:detail.instructionsPlaceholder"),
  };

  return { skillDetailLabels };
}

export function useSkillDialogLabels() {
  const { t } = useTranslation("skills");

  return {
    title: t("addDialog.title"),
    description: t("addDialog.description"),
    storeTab: t("addDialog.storeTab"),
    repoTab: t("addDialog.repoTab"),
    scratchTab: t("addDialog.scratchTab"),
    store: {
      searchPlaceholder: t("addDialog.store.searchPlaceholder"),
      popularHeading: t("addDialog.store.popularHeading"),
      alreadyInstalledHint: (count: number) =>
        t("addDialog.store.alreadyInstalledHint", { count }),
      noResults: (query: string) => t("addDialog.store.noResults", { query }),
      minQuery: t("addDialog.store.minQuery"),
      searchUnavailable: t("addDialog.store.searchUnavailable"),
      searchRateLimited: t("addDialog.store.searchRateLimited"),
      searchOffline: t("addDialog.store.searchOffline"),
      searchGeneric: t("addDialog.store.searchGeneric"),
      loadingPopular: t("addDialog.store.loadingPopular"),
      popularUnavailable: t("addDialog.store.popularUnavailable"),
      retry: t("addDialog.store.retry"),
      typeToSearch: t("addDialog.store.typeToSearch"),
      installCount: (count: number, formatted: string) =>
        t("addDialog.store.installCount", { count, formatted }),
      installSkill: (name: string) =>
        t("addDialog.store.installSkill", { name }),
      installedSkill: (name: string) =>
        t("addDialog.store.installedSkill", { name }),
      alreadyInstalledBadge: t("addDialog.store.alreadyInstalledBadge"),
      installedJustNow: t("addDialog.store.installedJustNow"),
      installFailedAlready: t("addDialog.store.installFailedAlready"),
      installFailedRepoMissing: t("addDialog.store.installFailedRepoMissing"),
      installFailedMalformed: t("addDialog.store.installFailedMalformed"),
      installFailedRateLimited: t("addDialog.store.installFailedRateLimited"),
      installFailedOffline: t("addDialog.store.installFailedOffline"),
      installFailedGeneric: t("addDialog.store.installFailedGeneric"),
      installRetryAria: (name: string) =>
        t("addDialog.store.installRetryAria", { name }),
    },
    repo: {
      sourcePlaceholder: t("addDialog.repo.sourcePlaceholder"),
      findSkills: t("addDialog.repo.findSkills"),
      installSelected: (count: number) =>
        t("addDialog.repo.installSelected", { count }),
      skillsFound: (count: number) =>
        t("addDialog.repo.skillsFound", { count }),
      selectAll: t("addDialog.repo.selectAll"),
      deselectAll: t("addDialog.repo.deselectAll"),
      inputHint: t("addDialog.repo.inputHint"),
      installedSummary: (count: number, names: string) =>
        t("addDialog.repo.installedSummary", { count, names }),
      installAnotherRepo: t("addDialog.repo.installAnotherRepo"),
    },
    scratch: {
      titleLabel: t("addDialog.scratch.titleLabel"),
      titlePlaceholder: t("addDialog.scratch.titlePlaceholder"),
      titleHint: t("addDialog.scratch.titleHint"),
      slugPreviewPrefix: t("addDialog.scratch.slugPreviewPrefix"),
      descriptionLabel: t("addDialog.scratch.descriptionLabel"),
      descriptionPlaceholder: t("addDialog.scratch.descriptionPlaceholder"),
      descriptionHint: t("addDialog.scratch.descriptionHint"),
      bodyLabel: t("addDialog.scratch.bodyLabel"),
      bodyPlaceholder: t("addDialog.scratch.bodyPlaceholder"),
      bodyHint: t("addDialog.scratch.bodyHint"),
      submit: t("addDialog.scratch.submit"),
      submitting: t("addDialog.scratch.submitting"),
      errorTitleRequired: t("addDialog.scratch.errorTitleRequired"),
      errorBodyRequired: t("addDialog.scratch.errorBodyRequired"),
      errorSlugTaken: t("addDialog.scratch.errorSlugTaken"),
    },
  };
}
