export type SkillsListState = "rows" | "no-skills" | "no-matches";

export function skillsListShowsRows(matched: number): boolean {
  return matched > 0;
}

export function resolveSkillsListState(input: {
  total: number;
  matched: number;
}): SkillsListState {
  if (skillsListShowsRows(input.matched)) return "rows";
  return input.total === 0 ? "no-skills" : "no-matches";
}
