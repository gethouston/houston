import type { SkillDescriptionLabels } from "./skill-description";

/**
 * Copy for {@link SkillPreviewModal}. The `ui/` boundary keeps the package
 * i18n-agnostic: every string is optional and falls back to the English
 * defaults below, with the app filling them from `t()`.
 */
export interface SkillPreviewSheetLabels {
  install?: string;
  installing?: string;
  installed?: string;
  loadFailed?: string;
  noDescription?: string;
  bySource?: (owner: string, repo: string) => string;
  installsCount?: (count: number, formatted: string) => string;
  /** Heading above the skill's authored category chip. */
  categoryHeading?: string;
  tagsHeading?: string;
  /** Collapsed-state trigger for the full SKILL.md body. */
  viewInstructions?: string;
  /** Expanded-state trigger for the full SKILL.md body. */
  hideInstructions?: string;
  /** Stable accessible name for the expanded instructions pane. */
  instructionsHeading?: string;
  /**
   * Localize an authored category for display (the chip shows the result).
   * Identity by default; the app wires its skill-category localizer in.
   */
  formatCategory?: (category: string) => string;
  description?: SkillDescriptionLabels;
}

export const DEFAULT_SKILL_PREVIEW_LABELS: Required<SkillPreviewSheetLabels> = {
  install: "Install",
  installing: "Installing...",
  installed: "Installed",
  loadFailed: "Couldn't load the full description. You can still install.",
  noDescription: "No description provided.",
  bySource: (owner, repo) => `by ${owner} · ${repo}`,
  installsCount: (count, formatted) =>
    count === 1 ? `${formatted} install` : `${formatted} installs`,
  categoryHeading: "Category",
  tagsHeading: "Tags",
  viewInstructions: "View full instructions",
  hideInstructions: "Hide full instructions",
  instructionsHeading: "Full instructions",
  formatCategory: (category) => category,
  description: {},
};
