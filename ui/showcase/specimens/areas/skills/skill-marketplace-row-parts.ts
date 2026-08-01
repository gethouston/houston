import type { SpecimenProp } from "../../../src/specimen";

/**
 * `SkillMarketplaceRowProps`, read off `ui/skills/src/skill-marketplace-row.tsx`.
 * Exports no `specimen` and no `sources`.
 */
export const rowProps: SpecimenProp[] = [
  {
    name: "skill",
    type: "CommunitySkill",
    note: "The skills.sh result. `skillId` (falling back to `name`) becomes the title; `source` gives the owner and the avatar.",
  },
  {
    name: "installing",
    type: "boolean",
    note: "This row's install is in flight — the + spins.",
  },
  {
    name: "installed",
    type: "boolean",
    note: "Already on the agent: green status dot, and the + becomes a static check.",
  },
  {
    name: "onInstall",
    type: "() => void",
    note: "The + action. Never fires from the row body.",
  },
  {
    name: "onOpenInfo",
    type: "() => void",
    note: "The row body — opens the preview modal.",
  },
  {
    name: "labels",
    type: "SkillMarketplaceCardLabels",
    note: "`bySource`, `installsCount`, and the two aria strings, already translated.",
  },
];
