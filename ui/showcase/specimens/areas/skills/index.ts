import type { Specimen } from "../../../src/specimen";
import { specimen as addSkillDialog } from "./add-skill-dialog";
import { specimen as skillCategorySelect } from "./skill-category-select";
import { specimen as skillEditModal } from "./skill-edit-modal";
import { specimen as skillMarketplaceGrid } from "./skill-marketplace-grid";
import { specimen as skillMarketplaceRow } from "./skill-marketplace-row";
import { specimen as skillMarketplaceShelves } from "./skill-marketplace-shelves";
import { specimen as skillOwnerAvatar } from "./skill-owner-avatar";
import { specimen as skillPreviewModal } from "./skill-preview-modal";
import { specimen as skillRow } from "./skill-row";
import { specimen as skillsGrid } from "./skills-grid";

/**
 * The **Skills** area: the skill library and everything that picks from it —
 * the installed list with its two authoring paths and its editor, then the
 * skills.sh marketplace (the search grid, the curated shelves, one row, the
 * category pill), the preview a row opens, and the owner mark they all carry.
 *
 * One file per screen in this folder (`<screen>.tsx`, exporting
 * `export const specimen: Specimen` with `group: "Skills"` alongside
 * `export const sources: string[]`), imported here and listed below in the
 * order the product shows them: what the agent already has, then how a founder
 * finds more. The fixtures (`sample.ts`, `handlers.ts`) and the `-parts`
 * modules export neither, and are pulled in by the pages that use them.
 */
export const specimens: readonly Specimen[] = [
  skillRow,
  skillsGrid,
  addSkillDialog,
  skillEditModal,
  skillMarketplaceGrid,
  skillMarketplaceShelves,
  skillMarketplaceRow,
  skillCategorySelect,
  skillPreviewModal,
  skillOwnerAvatar,
];
