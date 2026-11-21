import type {
  PortableExportSelection,
  PortableInventoryPreview,
} from "@houston/engine-adapter";

export interface WizardSelection {
  claudeMd: boolean;
  skillSlugs: Set<string>;
  routineIds: Set<string>;
  learningIds: Set<string>;
}

export type CopyWizardStep =
  | "source"
  | "instructions"
  | "routines"
  | "skills"
  | "name";

export function copyWizardSteps(
  preview: PortableInventoryPreview | null,
): CopyWizardStep[] {
  if (!preview) return ["source"];
  const steps: CopyWizardStep[] = ["source", "instructions"];
  if (preview.routines.length > 0) steps.push("routines");
  if (preview.skills.length > 0) steps.push("skills");
  steps.push("name");
  return steps;
}

export function fullCopySelection(
  preview: PortableInventoryPreview,
): WizardSelection {
  return {
    claudeMd: preview.claudeMd !== null,
    skillSlugs: new Set(preview.skills.map((skill) => skill.slug)),
    routineIds: new Set(preview.routines.map((routine) => routine.id)),
    learningIds: new Set(preview.learnings.map((learning) => learning.id)),
  };
}

export function toCopySelection(sel: WizardSelection): PortableExportSelection {
  return {
    includeClaudeMd: sel.claudeMd,
    includeSkillSlugs: Array.from(sel.skillSlugs),
    includeRoutineIds: Array.from(sel.routineIds),
    includeLearningIds: Array.from(sel.learningIds),
  };
}
