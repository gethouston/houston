import type { Specimen } from "../../../src/specimen";
import { specimen as addSkillDialog } from "./add-skill-dialog";
import { specimen as skillEditModal } from "./skill-edit-modal";
import { specimen as skillOwnerAvatar } from "./skill-owner-avatar";
import { specimen as skillPreviewModal } from "./skill-preview-modal";
import { specimen as skillRow } from "./skill-row";
import { specimen as skillWorkflowSteps } from "./skill-workflow-steps";

/**
 * The **Skills** area: the skill library and everything that picks from it —
 * the row a skill is listed as, the two authoring paths and the editor behind
 * them, the workflow steps a Houston-written skill reads as, the preview a row
 * opens, and the owner mark they all carry.
 *
 * One file per screen in this folder (`<screen>.tsx`, exporting
 * `export const specimen: Specimen` with `group: "Skills"` alongside
 * `export const sources: string[]`), imported here and listed below in the
 * order the product shows them. The fixtures (`sample.ts`, `handlers.ts`) and the `-parts`
 * modules export neither, and are pulled in by the pages that use them.
 */
export const specimens: readonly Specimen[] = [
  skillRow,
  addSkillDialog,
  skillEditModal,
  skillWorkflowSteps,
  skillPreviewModal,
  skillOwnerAvatar,
];
