/**
 * Copy for {@link SkillEditModal}. The package stays i18n-agnostic: every
 * string is optional and falls back to the English default, and the app passes
 * its `t()` results in.
 */
export interface SkillEditModalLabels {
  save?: string;
  saving?: string;
  cancel?: string;
  /** The destructive footer action; only rendered when `onDelete` is wired. */
  delete?: string;
  editorPlaceholder?: string;
  loadFailed?: string;
}

export const DEFAULT_SKILL_EDIT_MODAL_LABELS: Required<SkillEditModalLabels> = {
  save: "Save changes",
  saving: "Saving...",
  cancel: "Cancel",
  delete: "Delete skill",
  editorPlaceholder: "Instructions for this skill...",
  loadFailed: "Couldn't load this skill's instructions.",
};
