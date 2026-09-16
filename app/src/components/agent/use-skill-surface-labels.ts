import type { SkillPreviewSheetLabels } from "@houston-ai/skills";
import { useTranslation } from "react-i18next";
import { localizeSkillCategory } from "../../lib/localize-skill-category";

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
      errorDescriptionRequired: t("addDialog.scratch.errorDescriptionRequired"),
      errorBodyRequired: t("addDialog.scratch.errorBodyRequired"),
      errorSlugTaken: t("addDialog.scratch.errorSlugTaken"),
    },
  };
}

/**
 * Copy for the shared {@link SkillPreviewModal} — the one detail surface the
 * workspace-store and cross-agent skill previews both open. `ui/skills` is
 * i18n-agnostic, so the app fills every string from `t()`.
 */
export function useSkillPreviewLabels(): SkillPreviewSheetLabels {
  const { t } = useTranslation("skills");

  return {
    install: t("preview.install"),
    installing: t("preview.installing"),
    installed: t("preview.installed"),
    loadFailed: t("preview.loadFailed"),
    noDescription: t("preview.noDescription"),
    bySource: (owner: string, repo: string) =>
      t("preview.bySource", { owner, repo }),
    installsCount: (count: number, formatted: string) =>
      t("preview.installsCount", { count, formatted }),
    categoryHeading: t("preview.categoryHeading"),
    workflowHeading: t("detail.workflowHeading"),
    tagsHeading: t("preview.tagsHeading"),
    viewInstructions: t("preview.viewInstructions"),
    hideInstructions: t("preview.hideInstructions"),
    instructionsHeading: t("preview.instructionsHeading"),
    formatCategory: (category: string) => localizeSkillCategory(category, t),
    description: {
      alsoMatches: (keywords: string) => t("preview.alsoMatches", { keywords }),
    },
  };
}
