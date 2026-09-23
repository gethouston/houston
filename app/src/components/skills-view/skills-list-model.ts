/**
 * Which reading the Skills library list owes the user for the rows it holds,
 * kept pure so the decision is node-testable and the strip stays a renderer.
 *
 * The three are genuinely different states, not one blank: a workspace with no
 * skills yet needs pointing at the way to create one, while a query that
 * matched nothing needs the query back so the user can see what was searched.
 */
export type SkillsListState = "rows" | "no-skills" | "no-matches";

/**
 * Whether the list stands as rows, read from the number it would show.
 *
 * The two empty readings are still one absence, and the strip's section header
 * belongs over rows: titled and counted above an empty state it reads "Your
 * skills 0" over "No skills yet", naming something that is not there.
 */
export function skillsListShowsRows(matched: number): boolean {
  return matched > 0;
}

export function resolveSkillsListState(input: {
  /** Rows the workspace holds, before the search narrows them. */
  total: number;
  /** Rows the current query keeps. */
  matched: number;
}): SkillsListState {
  if (skillsListShowsRows(input.matched)) return "rows";
  // A search over a workspace with nothing in it is still the empty workspace:
  // "no skills match" would blame the query for an absence it did not cause.
  return input.total === 0 ? "no-skills" : "no-matches";
}
