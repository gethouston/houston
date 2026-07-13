import type {
  SkillEditModalLabels,
  SkillMarketplaceSectionLabels,
} from "@houston-ai/skills";
import { useTranslation } from "react-i18next";

/**
 * Labels for the edit modal (the installed tiles' one detail surface — its
 * footer now carries the destructive delete) and the shared delete-confirmation
 * copy. The `ui/` pieces are i18n-agnostic; this fills their `labels` props
 * from `t()`. Save/placeholder reuse the former detail screen's `detail.*`
 * keys; Cancel/Delete come from the shared `common:actions`.
 */
export function useSkillSurfaceLabels() {
  const { t } = useTranslation(["skills", "common"]);

  const editModalLabels: SkillEditModalLabels = {
    save: t("skills:detail.saveChanges"),
    saving: t("skills:detail.savingChanges"),
    cancel: t("common:actions.cancel"),
    delete: t("common:actions.delete"),
    editorPlaceholder: t("skills:detail.instructionsPlaceholder"),
    loadFailed: t("skills:detail.loadFailed"),
  };

  const deleteConfirm = {
    title: (name: string) => t("skills:detail.deleteTitle", { name }),
    description: t("skills:detail.deleteDescription"),
    confirmLabel: t("common:actions.delete"),
  };

  return { editModalLabels, deleteConfirm };
}

export function useSkillDialogLabels() {
  const { t } = useTranslation("skills");

  return {
    title: t("addDialog.title"),
    description: t("addDialog.description"),
    repoTab: t("addDialog.repoTab"),
    scratchTab: t("addDialog.scratchTab"),
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

/**
 * Labels for the inline {@link SkillMarketplaceSection} (the skills.sh "store"
 * moved out of the Add Skill dialog into a page section). Reads from the
 * top-level `store.*` keys; titles localized, shelf queries stay English
 * because skills.sh is English.
 */
export function useSkillMarketplaceSectionLabels(): SkillMarketplaceSectionLabels {
  const { t } = useTranslation("skills");

  return {
    heading: t("store.heading"),
    subheading: t("store.subheading"),
    searchPlaceholder: t("store.searchPlaceholder"),
    publisherAllLabel: t("store.publisherAll"),
    allCategories: t("store.allCategories"),
    categoryAria: t("store.categoryAria"),
    noResults: (query: string) => t("store.noResults", { query }),
    searchRateLimited: t("store.searchRateLimited"),
    searchOffline: t("store.searchOffline"),
    searchGeneric: t("store.searchGeneric"),
    typeToSearch: t("store.typeToSearch"),
    minQuery: t("store.minQuery"),
    seeAll: t("store.seeAll"),
    retry: t("store.retry"),
    browseUnavailable: t("store.browseUnavailable"),
    poweredByVercel: t("store.poweredByVercel"),
    shelves: [
      {
        id: "marketing",
        title: t("store.shelves.marketing"),
        query: "marketing",
      },
      { id: "sales", title: t("store.shelves.sales"), query: "sales" },
      { id: "writing", title: t("store.shelves.writing"), query: "writing" },
      { id: "research", title: t("store.shelves.research"), query: "research" },
      { id: "legal", title: t("store.shelves.legal"), query: "legal" },
      {
        id: "productivity",
        title: t("store.shelves.productivity"),
        query: "productivity",
      },
    ],
    card: {
      installAria: (name: string) => t("store.card.installAria", { name }),
      installedAria: (name: string) => t("store.card.installedAria", { name }),
      installsCount: (count: number, formatted: string) =>
        t("store.card.installsCount", { count, formatted }),
      bySource: (owner: string) => t("store.card.bySource", { owner }),
    },
    preview: {
      install: t("store.preview.install"),
      installing: t("store.preview.installing"),
      installed: t("store.preview.installed"),
      loadFailed: t("store.preview.loadFailed"),
      noDescription: t("store.preview.noDescription"),
      bySource: (owner: string, repo: string) =>
        t("store.preview.bySource", { owner, repo }),
      installsCount: (count: number, formatted: string) =>
        t("store.preview.installsCount", { count, formatted }),
      tagsHeading: t("store.preview.tagsHeading"),
      description: {
        alsoMatches: (keywords: string) =>
          t("store.preview.alsoMatches", { keywords }),
      },
    },
  };
}
