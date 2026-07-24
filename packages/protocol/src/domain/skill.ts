// Skills — SKILL.md folders (Agent Skills standard) under .agents/skills/.
// v3 drops v1's legacy structured-inputs + prompt-template fields: they were
// parse-for-compat only and nothing sends them anymore.

export interface SkillSummary {
  name: string;
  /**
   * Display title from frontmatter `title:` — the human phrase shown on
   * cards, with accents/casing a directory slug can't carry (translated
   * store skills ship one, e.g. slug `planear-una-campana`, title
   * "Planear una campaña"). Null → UI humanizes the slug. Loading still
   * resolves by `name` (the directory slug) everywhere.
   */
  title: string | null;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  lastUsed: string | null;
  /** User-facing category; drives grouping in the "New mission" picker. */
  category: string | null;
  /** Surface on the Featured tab of the picker. */
  featured: boolean;
  /** Integration slugs this skill touches. */
  integrations: string[];
  /** Image URL or Microsoft Fluent Emoji slug (e.g. "rocket"). */
  image: string | null;
}

export interface SkillDetail {
  name: string;
  /** Display title from frontmatter `title:`; see {@link SkillSummary.title}. */
  title: string | null;
  description: string;
  version: number;
  content: string;
}

/** A skill in the skills.sh community directory (marketplace search hit). */
export interface CommunitySkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  /** GitHub `owner/repo` the skill installs from. */
  source: string;
}

/** Full detail fetched on-demand for a community skill, read from its real SKILL.md. */
export interface CommunitySkillPreview {
  title: string | null;
  description: string;
  image: string | null;
  category: string | null;
  tags: string[];
}

/** A skill discovered in a GitHub repo (one per SKILL.md found). */
export interface RepoSkill {
  /** The install slug — the SKILL.md's frontmatter name or its directory. */
  id: string;
  /** Human-readable title (SKILL.md `# Heading`, or title-cased id). */
  name: string;
  /** Short description from the SKILL.md frontmatter, if any. */
  description: string;
  /** Full path within the repo (e.g. `research/SKILL.md`). */
  path: string;
}

export interface CreateSkill {
  name: string;
  description: string;
  content: string;
}

export interface SaveSkill {
  content: string;
}
