export interface Skill {
  id: string;
  name: string;
  /** Display title (accents/casing the slug can't carry); null → humanize name. */
  title?: string | null;
  description: string;
  instructions: string;
  file_path: string;
}

export interface CommunitySkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

/** A skill discovered in a GitHub repo */
export interface RepoSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

export type LearningCategory =
  | "pattern"
  | "pitfall"
  | "preference"
  | "procedure";

export const CATEGORY_LABELS: Record<LearningCategory, string> = {
  pattern: "Pattern",
  pitfall: "Pitfall",
  preference: "Preference",
  procedure: "Procedure",
};

export interface SkillLearning {
  id: string;
  skill_id: string;
  project_id: string;
  content: string;
  rationale: string;
  category: LearningCategory;
  source_issue_id: string | null;
  source_issue_title: string | null;
  created_at: string;
}
