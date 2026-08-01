import type {
  CommunitySkill,
  CommunitySkillPreview,
  RepoSkill,
  Skill,
} from "@houston-ai/skills";

/**
 * The Skills area's shared fixtures: one founder's installed skills, the
 * skills.sh rows the marketplace shows them, and the SKILL.md a preview loads.
 * Real Houston content — an agent's actual procedures — so every page on this
 * area reviews the component against the copy lengths the product produces.
 *
 * Exports no `specimen` and no `sources`: this is a helper module, pulled in by
 * the pages beside it.
 */

/** Installed skills, as `SkillsGrid` receives them (unsorted on purpose). */
export const installedSkills: Skill[] = [
  {
    id: "skill-weekly-report",
    name: "weekly-report",
    title: null,
    description:
      "Pulls Friday's numbers and writes the update the team reads on Monday.",
    instructions: "## Procedure\n\n1. Open the metrics sheet.\n",
    file_path: ".houston/skills/weekly-report/SKILL.md",
  },
  {
    id: "skill-inbox-triage",
    name: "inbox-triage",
    title: null,
    description:
      "Sorts the shared mailbox every morning, drafts each reply, and escalates anything Inbox Zero is unsure about.",
    instructions: "## Procedure\n\n1. Read every unread thread.\n",
    file_path: ".houston/skills/inbox-triage/SKILL.md",
  },
  {
    id: "skill-draft-contract",
    name: "draft-contract",
    title: "Draft a contract",
    description: "",
    instructions: "## Procedure\n\n1. Ask what kind of contract.\n",
    file_path: ".houston/skills/draft-contract/SKILL.md",
  },
  {
    id: "skill-meeting-notes",
    name: "meeting-notes",
    title: null,
    description:
      "Turns the Meeting Notes transcript into a summary and files the follow-ups.",
    instructions: "## Procedure\n\n1. Fetch the transcript.\n",
    file_path: ".houston/skills/meeting-notes/SKILL.md",
  },
];

/** Lowercase slugs already on disk — the `installedSkillNames` contract. */
export const installedSlugs: Set<string> = new Set(
  installedSkills.map((skill) => skill.name),
);

/** skills.sh rows: `skillId` drives the title, `source` the owner avatar. */
export const communitySkills: CommunitySkill[] = [
  {
    id: "cs-contract-drafting",
    skillId: "contract-drafting",
    name: "contract-drafting",
    installs: 39_500,
    source: "anthropics/skills",
  },
  {
    id: "cs-inbox-triage",
    skillId: "inbox-triage",
    name: "inbox-triage",
    installs: 12_400,
    source: "vercel/skills",
  },
  {
    id: "cs-meeting-notes",
    skillId: "meeting-notes",
    name: "meeting-notes",
    installs: 8_120,
    source: "julian/houston-skills",
  },
  {
    id: "cs-weekly-report",
    skillId: "weekly-report",
    name: "weekly-report",
    installs: 1_240,
    source: "anthropics/skills",
  },
  {
    id: "cs-expense-filer",
    skillId: "expense-filer",
    name: "expense-filer",
    installs: 1,
    source: "stripe/skills",
  },
  {
    id: "cs-standup-buddy",
    skillId: "standup-buddy",
    name: "standup-buddy",
    installs: 0,
    source: "supabase/skills",
  },
];

/** SKILL.md files discovered in a repo, as `onListFromRepo` resolves them. */
export const repoSkills: RepoSkill[] = [
  {
    id: "repo-contract-drafting",
    name: "contract-drafting",
    description: "Drafts a starter contract you can review and sign.",
    path: "skills/contract-drafting/SKILL.md",
  },
  {
    id: "repo-pdf-filler",
    name: "pdf-filler",
    description: "Fills a PDF form from a spreadsheet row.",
    path: "skills/pdf-filler/SKILL.md",
  },
  {
    id: "repo-brand-voice",
    name: "brand-voice",
    description: "",
    path: "skills/brand-voice/SKILL.md",
  },
  {
    id: "repo-inbox-triage",
    name: "inbox-triage",
    description: "Sorts a shared mailbox and drafts the replies.",
    path: "skills/inbox-triage/SKILL.md",
  },
];

/**
 * A loaded SKILL.md: the `description:` frontmatter carries the run-on
 * `(1) … (2) …` enumeration and the trailing `Triggers on:` clause community
 * skills really ship, so the preview's description formatting is under review.
 */
export const skillPreview: CommunitySkillPreview = {
  title: "Contract drafting",
  description:
    'Drafts a starter contract from your own templates: (1) asks which agreement you need, (2) pulls the latest template from Drive, (3) fills the parties and dates, (4) shares it for review. Triggers on: "contract", "NDA", "agreement", "sign"',
  image: null,
  category: "Legal",
  tags: ["contracts", "legal", "drive"],
  integrations: ["googledrive", "gmail"],
  content:
    "# Contract drafting\n\n## Procedure\n\n1. Ask which agreement the founder needs.\n2. Pull the latest template from Drive.\n3. Fill in the parties, dates and amounts.\n4. Share the draft for review — never send it.\n\n## Notes\n\nEscalate anything with a non-standard liability clause.\n",
};

/** The same skill with nothing but a body — the bare-preview shape. */
export const bareSkillPreview: CommunitySkillPreview = {
  title: null,
  description: "",
  image: null,
  category: null,
  tags: [],
  integrations: [],
  content: null,
};

/** Resolves after `ms`, so a specimen can show a real in-flight stage. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
