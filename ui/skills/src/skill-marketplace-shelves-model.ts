/**
 * Pure, JSX-free and React-free model for the marketplace "browse" empty state:
 * the curated category shelves shown when no query is typed and no category is
 * selected. Each shelf is one skills.sh search query (validated to return a full
 * result set). The effectful fetching + abort lifecycle lives in
 * `use-skill-marketplace-shelves.ts`; the branchy derivations live here so they
 * are unit-testable by the package's `node --experimental-strip-types --test`
 * runner, which cannot load `.tsx`.
 */

import { ownerOf } from "./skill-marketplace-util.ts";
import type { CommunitySkill } from "./types";

export interface MarketplaceShelf {
  /** Stable key, also the locale-key suffix. */
  id: string;
  /** Display title (localized by the app). */
  title: string;
  /** skills.sh search query (NOT localized; skills.sh is English). */
  query: string;
}

/**
 * Founder-relevant default shelves, in display order. Each `query` is validated
 * against the live skills.sh API to return a full result set. English defaults
 * per the `ui/` labels convention; the app overrides `title` with `t()` results.
 */
export const DEFAULT_SHELVES: MarketplaceShelf[] = [
  { id: "marketing", title: "Marketing", query: "marketing" },
  { id: "sales", title: "Sales", query: "sales" },
  { id: "writing", title: "Writing", query: "writing" },
  { id: "research", title: "Research", query: "research" },
  { id: "legal", title: "Legal", query: "legal" },
  { id: "productivity", title: "Productivity", query: "productivity" },
];

/** Max cards rendered per shelf row. */
export const SHELF_CARD_CAP = 8;

/** Max rows rendered in a shelf's mini-grid; See all opens the full search. */
export const SHELF_GRID_CAP = 4;

/** Per-shelf fetch state. */
export type ShelfState =
  | { status: "loading" }
  | { status: "ready"; skills: CommunitySkill[] }
  | { status: "error" };

/** A shelf resolved for rendering: metadata + its current fetch state. */
export interface ResolvedShelf {
  id: string;
  title: string;
  /** skills.sh query the shelf's fetch and its "See all" selection run. */
  query: string;
  state: ShelfState;
}

/** Cap a shelf's skills at the per-row maximum. */
export function capShelfSkills(
  skills: CommunitySkill[],
  max = SHELF_CARD_CAP,
): CommunitySkill[] {
  return skills.slice(0, max);
}

/**
 * One skill per publisher, keeping each owner's FIRST (most relevant) hit in
 * query order — a single prolific author can't fill a whole preview shelf
 * with near-identical rows. Preview-only: search / category results stay
 * complete, so nothing is ever undiscoverable.
 */
export function dedupeByOwner(skills: CommunitySkill[]): CommunitySkill[] {
  const seen = new Set<string>();
  const unique: CommunitySkill[] = [];
  for (const skill of skills) {
    const owner = ownerOf(skill.source);
    if (seen.has(owner)) continue;
    seen.add(owner);
    unique.push(skill);
  }
  return unique;
}

/**
 * Map a settled fetch to a shelf state: dedupe to one skill per author (the
 * preview never repeats a publisher), THEN cap. An empty result degrades to
 * `error` (so the shelf hides) rather than showing a blank row — dedupe never
 * empties a non-empty list, so it can't cause that degrade by itself.
 */
export function shelfStateFromSkills(skills: CommunitySkill[]): ShelfState {
  const capped = capShelfSkills(dedupeByOwner(skills));
  return capped.length === 0
    ? { status: "error" }
    : { status: "ready", skills: capped };
}

/**
 * Render up to `cap` rows per shelf with NO author repeated anywhere in the
 * preview: walking the shelves in display order, a skill renders only if its
 * owner has not been rendered by ANY earlier shelf (or earlier in this one) —
 * skills.sh categories overlap heavily, so without the cross-shelf pass the
 * same prolific publishers headlined every shelf. Only owners of skills
 * actually RENDERED (post-cap) count as taken, so an uncapped spare in one
 * shelf never blocks a later shelf. Loading / errored shelves pass through; a
 * ready shelf whose every candidate was already shown ends up EMPTY and
 * {@link isShelfVisible} hides it. Pure — the component applies it at render
 * time over the progressively-resolving shelf states.
 */
export function dedupeAcrossShelves(
  shelves: ResolvedShelf[],
  cap = SHELF_GRID_CAP,
): ResolvedShelf[] {
  const rendered = new Set<string>();
  return shelves.map((shelf) => {
    if (shelf.state.status !== "ready") return shelf;
    const rows: CommunitySkill[] = [];
    for (const skill of shelf.state.skills) {
      if (rows.length >= cap) break;
      const owner = ownerOf(skill.source);
      if (rendered.has(owner)) continue;
      rendered.add(owner);
      rows.push(skill);
    }
    return { ...shelf, state: { status: "ready", skills: rows } };
  });
}

/** A shelf renders only while loading or once it has ready cards — a ready
 *  shelf emptied by {@link dedupeAcrossShelves} hides like an errored one. */
export function isShelfVisible(state: ShelfState): boolean {
  return (
    state.status === "loading" ||
    (state.status === "ready" && state.skills.length > 0)
  );
}

/**
 * True when there is at least one shelf and every one has failed, so the browse
 * view degrades to the single retryable "suggestions unavailable" fallback
 * instead of an empty screen.
 */
export function allShelvesFailed(states: ShelfState[]): boolean {
  return states.length > 0 && states.every((s) => s.status === "error");
}
