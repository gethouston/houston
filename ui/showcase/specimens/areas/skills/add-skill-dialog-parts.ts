import type { SpecimenProp } from "../../../src/specimen";

/**
 * `AddSkillDialogProps`, read off `ui/skills/src/add-skill-dialog.tsx`, plus
 * the GitHub view's stage list. Exports no `specimen` and no `sources`.
 */
export const dialogProps: SpecimenProp[] = [
  {
    name: "open",
    type: "boolean",
    note: "Controlled. Re-opening resets the authoring form; the GitHub view keeps its last stage.",
  },
  {
    name: "onOpenChange",
    type: "(open: boolean) => void",
    note: "Required. A successful authoring submit calls it with `false` itself.",
  },
  {
    name: "onListFromRepo",
    type: "(source: string) => Promise<RepoSkill[]>",
    note: "Discovers every SKILL.md in `owner/repo`. A rejection renders its message inline and returns to the input stage.",
  },
  {
    name: "onInstallFromRepo",
    type: "(source: string, skills: RepoSkill[]) => Promise<string[]>",
    note: "Installs the ticked skills; resolves with the installed slugs for the done stage.",
  },
  {
    name: "onCreateFromScratch",
    type: "(input: { name: string; description: string; content: string }) => Promise<string>",
    note: "Authors a skill from the form. Omit it and the From scratch tab disappears.",
  },
  {
    name: "installedSkillNames",
    type: "Set<string>",
    note: "Lowercase slugs already on disk. The derived slug turns red and Create stays disabled on a collision.",
  },
  {
    name: "labels",
    type: "AddSkillDialogLabels",
    note: "Title, description, both tab labels, and the nested `repo` / `scratch` label sets — already translated.",
  },
];

/** The GitHub view's `RepoStage` machine, in the order a user walks it. */
export const repoStages: { stage: string; what: string }[] = [
  {
    stage: "input",
    what: "An empty owner/repo field with the hint under it. Find skills is disabled until something is typed.",
  },
  {
    stage: "loading",
    what: "The field locks and the button swaps its label for a spinner while the repo is read.",
  },
  {
    stage: "selection",
    what: "Every SKILL.md found, all ticked, with the count and Select all / Deselect all above them. The button becomes Install N.",
  },
  {
    stage: "installing",
    what: "The unticked rows drop out and the remaining list dims; the button spins.",
  },
  {
    stage: "done",
    what: "A check line naming what was installed, over Install from another repo, which resets to input.",
  },
];
