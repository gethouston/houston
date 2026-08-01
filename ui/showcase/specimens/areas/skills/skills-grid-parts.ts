import type { SpecimenProp } from "../../../src/specimen";

/**
 * `SkillsGridProps`, read off `ui/skills/src/skills-grid.tsx`. Kept beside the
 * page so the page itself stays a readable document; exports no `specimen` and
 * no `sources`.
 */
export const gridProps: SpecimenProp[] = [
  {
    name: "skills",
    type: "Skill[]",
    note: "The installed skills. Sorted by slug for display — the caller's order is not preserved.",
  },
  {
    name: "loading",
    type: "boolean",
    note: "Shows the loading line only while `skills` is still empty; a refetch never blanks a filled list.",
  },
  {
    name: "onSkillClick",
    type: "(skill: Skill) => void",
    note: "Opens a skill. Required.",
  },
  {
    name: "onDelete",
    type: "(name: string) => Promise<void>",
    note: "Deletes by slug. Wiring it adds the per-row menu and the confirm dialog in front of it.",
  },
  {
    name: "onListFromRepo",
    type: "(source: string) => Promise<RepoSkill[]>",
    note: "Discovers every SKILL.md in a GitHub repo. Pairs with `onInstallFromRepo` — one without the other hides the GitHub tab.",
  },
  {
    name: "onInstallFromRepo",
    type: "(source: string, skills: RepoSkill[]) => Promise<string[]>",
    note: "Installs the picked skills; resolves with the installed slugs.",
  },
  {
    name: "onCreateFromScratch",
    type: "(input: { name: string; description: string; content: string }) => Promise<string>",
    note: "Authors a new skill; resolves with the slug Houston stored it under.",
  },
  {
    name: "installedSkillNames",
    type: "Set<string>",
    note: "Lowercase slugs already on disk. Flags a collision in the authoring form before submit.",
  },
  {
    name: "labels",
    type: "SkillsGridLabels",
    note: "Every user-visible string, already translated. Unset fields fall back to English — `ui/` owns no i18n.",
  },
];
