/** The connected app (and, when known, the exact action) a workflow step runs. */
export interface SkillStepIntegration {
  /** Composio toolkit slug, lowercase (e.g. "gmail"). */
  toolkit: string;
  /**
   * Exact action slug, uppercase (e.g. "GMAIL_SEND_EMAIL"); null when the step
   * names the app but not which of its actions it runs.
   */
  action: string | null;
}

/** One step of a skill's workflow, as the domain parser reads it out of SKILL.md. */
export interface SkillWorkflowStepItem {
  title: string;
  /** The step's supporting lines, newline-separated; null when the title says it all. */
  detail: string | null;
  /** The app the step acts on; null when it touches none. */
  integration: SkillStepIntegration | null;
}

export interface Skill {
  id: string;
  name: string;
  /** Display title (accents/casing the slug can't carry); null → humanize name. */
  title?: string | null;
  description: string;
  instructions: string;
  file_path: string;
}

/** Identity of the skill a {@link SkillPreviewModal} is showing. */
export interface PreviewSkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  /** Where the skill comes from, rendered as the modal's by-line. */
  source: string;
}

/** Full detail a preview shows, read from the skill's real SKILL.md. */
export interface PreviewSkillDetail {
  title: string | null;
  description: string;
  image: string | null;
  category: string | null;
  tags: string[];
  /** Composio toolkit slugs declared in the skill's frontmatter (e.g. "gmail"). */
  integrations: string[];
  /** Full SKILL.md markdown body with frontmatter stripped; null when unavailable. */
  content: string | null;
  /** The parsed procedure of a Houston-authored skill; absent for imported ones. */
  workflow?: SkillWorkflowStepItem[] | null;
}

/** A skill discovered in a GitHub repo */
export interface RepoSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}
