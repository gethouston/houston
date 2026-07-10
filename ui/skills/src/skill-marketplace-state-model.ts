/**
 * Pure, JSX-free and React-free phase transitions for the marketplace search
 * state machine that drives {@link SkillMarketplaceGrid}, plus the category /
 * browse derivations that decide what the section shows. The effectful glue
 * (debounce, AbortController, section lifecycle) lives in
 * `use-skill-marketplace-state.ts`; the branchy decisions live here so they are
 * unit-testable by the package's `node --experimental-strip-types --test`
 * runner, which cannot load `.tsx`.
 */

import { classifySkillError } from "./skill-error-kinds.ts";
import type { SkillMarketplacePhase } from "./skill-marketplace-grid";
import type { CommunitySkill } from "./types";

/** The selected-category value that means "no category filter". */
export const CATEGORY_ALL = "all";

/**
 * The skills.sh term to search for, given the typed query and the selected
 * category's query. A typed query always wins; otherwise a selected category
 * drives its full result list; an empty string means "show the browse shelves".
 */
export function effectiveSearchTerm(
  query: string,
  categoryQuery: string | null,
): string {
  const typed = query.trim();
  if (typed !== "") return typed;
  return categoryQuery ?? "";
}

/**
 * The curated browse shelves show only in the default view: nothing typed AND
 * no category selected. A selected category shows its flat result grid instead.
 */
export function showsShelves(query: string, category: string): boolean {
  return query.trim() === "" && category === CATEGORY_ALL;
}

/** A settled search: results, or the no-results terminal for an empty list. */
export function resultsPhase(
  skills: CommunitySkill[],
  query: string,
): SkillMarketplacePhase {
  return skills.length === 0
    ? { kind: "no-results", query }
    : { kind: "results", skills, query };
}

/**
 * A failed search. Returns `null` when the failure is an abort (a superseded
 * request), so the caller leaves the current phase untouched instead of
 * flashing an error for a request it deliberately cancelled.
 */
export function searchErrorPhase(
  err: unknown,
  query: string,
): SkillMarketplacePhase | null {
  const cls = classifySkillError(err);
  if (cls === "aborted") return null;
  const reason: "rate_limited" | "offline" | "generic" =
    cls === "rate_limited" || cls === "github_rate_limited"
      ? "rate_limited"
      : cls === "offline"
        ? "offline"
        : "generic";
  return { kind: "search-error", reason, query };
}

/**
 * The list to keep visible (dimmed) while the next search is in flight. Only a
 * live result set survives; errors reset to an empty skeleton so a fresh query
 * never looks like it returned the previous topic's cards.
 */
export function searchingPrevious(
  prev: SkillMarketplacePhase,
): CommunitySkill[] {
  if (prev.kind === "results") return prev.skills;
  if (prev.kind === "searching") return prev.previous;
  return [];
}
