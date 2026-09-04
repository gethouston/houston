import type {
  PortableExportSelection,
  PortableInventoryPreview,
} from "@houston-ai/engine-client";
import type { WizardSelection } from "../../lib/portable-share";

/**
 * The pure rules behind the create dialog's "Copy an agent" path. Unit-tested
 * in `app/tests/copy-agent-wizard-model.test.ts`.
 */

export type CopyWizardStep =
  | "source"
  | "instructions"
  | "routines"
  | "skills"
  | "name";

/**
 * The screens the wizard walks, for a chosen source. Content screens exist
 * only when the source has something to show on them: a bare agent goes
 * straight from the source list to naming, and no screen ever renders empty.
 * The instructions screen carries the job description AND the learnings, the
 * two things a non-technical user reads as "what the agent knows".
 */
export function copyWizardSteps(
  preview: PortableInventoryPreview | null,
): CopyWizardStep[] {
  if (!preview) return ["source"];
  const steps: CopyWizardStep[] = ["source"];
  if (preview.claudeMd !== null || preview.learnings.length > 0) {
    steps.push("instructions");
  }
  if (preview.routines.length > 0) steps.push("routines");
  if (preview.skills.length > 0) steps.push("skills");
  steps.push("name");
  return steps;
}

/** Everything on: the copy starts faithful and the user opts things OUT. */
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

/** The toggle Sets as the wire selection the portable package is built from. */
export function toCopySelection(sel: WizardSelection): PortableExportSelection {
  return {
    includeClaudeMd: sel.claudeMd,
    includeSkillSlugs: Array.from(sel.skillSlugs),
    includeRoutineIds: Array.from(sel.routineIds),
    includeLearningIds: Array.from(sel.learningIds),
  };
}
