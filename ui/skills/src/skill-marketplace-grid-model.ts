/**
 * Pure, JSX-free model for the skills marketplace grid: the publisher
 * derivation, the label defaults + resolver, and the phase-derived selectors.
 *
 * Kept in a `.ts` module (no JSX) so it is importable by the package's
 * `node --experimental-strip-types --test` runner, which cannot load `.tsx`.
 * `skill-marketplace-grid.tsx` re-exports `topPublishers`, so consumers still
 * import it from the grid module.
 */

import type {
  SkillMarketplaceGridLabels,
  SkillMarketplacePhase,
} from "./skill-marketplace-grid";
import type { SkillMarketplaceCardLabels } from "./skill-marketplace-row";
import { ownerOf } from "./skill-marketplace-util.ts";
import type { CommunitySkill } from "./types";

/** Top publishers (GitHub owners) by frequency in `skills`, most common first, capped at `max`. */
export function topPublishers(skills: CommunitySkill[], max = 6): string[] {
  const counts = new Map<string, number>();
  for (const skill of skills) {
    const owner = ownerOf(skill.source);
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  // Array.sort is stable, so equal-frequency owners keep Map insertion order
  // (first-seen order), the documented tie-break.
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([owner]) => owner);
}

export type ResolvedGridLabels = Required<
  Omit<SkillMarketplaceGridLabels, "card">
> & { card?: SkillMarketplaceCardLabels };

const DEFAULT_LABELS: Required<Omit<SkillMarketplaceGridLabels, "card">> = {
  searchPlaceholder: "Search more than 90K skills...",
  publisherAllLabel: "All",
  allCategories: "All categories",
  categoryAria: "Filter skills by category",
  noResults: (query: string) => `No skills found for "${query}"`,
  searchRateLimited:
    "Skills.sh is busy right now. Wait a moment and try again.",
  searchOffline: "Couldn't reach Skills.sh. Check your internet and try again.",
  searchGeneric: "Skill search hit a snag. Wait a moment and try again.",
  typeToSearch: "Type to search for skills",
  minQuery: "Type at least 2 characters to search",
};

/** Merge caller labels over the English defaults. */
export function resolveLabels(
  labels?: SkillMarketplaceGridLabels,
): ResolvedGridLabels {
  return { ...DEFAULT_LABELS, ...labels };
}

/** Visible skill list before client-side publisher filtering, by phase. */
export function visibleSkillsOf(
  phase: SkillMarketplacePhase,
): CommunitySkill[] {
  switch (phase.kind) {
    case "results":
      return phase.skills;
    case "searching":
      return phase.previous;
    default:
      return [];
  }
}

/** Identity of the current query/results, so a new search resets the filter. */
export function phaseSignature(phase: SkillMarketplacePhase): string {
  switch (phase.kind) {
    case "results":
    case "no-results":
    case "search-error":
      return `${phase.kind}:${phase.query}`;
    default:
      return phase.kind;
  }
}
