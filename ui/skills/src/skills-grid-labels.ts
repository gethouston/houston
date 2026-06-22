import type { AddSkillDialogLabels } from "./add-skill-dialog";

export interface SkillsGridLabels {
  loading?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  addSkill?: string;
  descriptionShort?: string;
  deleteTitle?: (name: string) => string;
  deleteTitleFallback?: string;
  deleteDescription?: string;
  deleteConfirmLabel?: string;
  addDialog?: AddSkillDialogLabels;
}

export const DEFAULT_SKILLS_GRID_LABELS: Required<
  Omit<SkillsGridLabels, "addDialog">
> = {
  loading: "Loading skills...",
  emptyTitle: "No skills installed",
  emptyDescription: "Skills are reusable procedures your agent can run.",
  addSkill: "Add skill",
  descriptionShort: "Reusable procedures your agent can lean on.",
  deleteTitle: (name) => `Delete "${name}"?`,
  deleteTitleFallback: "Delete skill?",
  deleteDescription:
    "This removes the skill from your agent. You can reinstall it later.",
  deleteConfirmLabel: "Delete",
};
