// Skills — SKILL.md folders (Agent Skills standard) under .agents/skills/.
// v3 drops v1's legacy structured-inputs + prompt-template fields: they were
// parse-for-compat only and nothing sends them anymore.

export interface SkillSummary {
  name: string;
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
  /** Image URL or Microsoft Fluent 3D Emoji slug (e.g. "rocket"). */
  image: string | null;
}

export interface SkillDetail {
  name: string;
  description: string;
  version: number;
  content: string;
}

export interface CreateSkill {
  name: string;
  description: string;
  content: string;
}

export interface SaveSkill {
  content: string;
}
