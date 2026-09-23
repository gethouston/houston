import type { Specimen } from "../../../src/specimen";
import { specimen as skillWorkflowSteps } from "./skill-workflow-steps";

/**
 * The **Skills** area: how a Houston-written skill reads on the skill's own
 * page — the numbered procedure behind SKILL.md.
 *
 * One file per screen in this folder (`<screen>.tsx`, exporting
 * `export const specimen: Specimen` with `group: "Skills"` alongside
 * `export const sources: string[]`), imported here and listed below in the
 * order the product shows them. The fixtures (`sample.ts`) export neither, and
 * are pulled in by the pages that use them.
 */
export const specimens: readonly Specimen[] = [skillWorkflowSteps];
