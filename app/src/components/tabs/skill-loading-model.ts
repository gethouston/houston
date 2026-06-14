/**
 * Which skill card, if any, should show a busy + disabled state.
 *
 * Clicking a skill card pins `selectedSkillName` and kicks off the async
 * `load_skill` detail fetch. Until that fetch resolves the grid stays
 * mounted, so a slow load (or one that 404s on a renamed/deleted skill)
 * leaves the card live with no feedback. Users read that as "nothing
 * happened" and rage-click, firing the fetch again and again. Returning the
 * in-flight skill name lets the caller disable + spin that one card so the
 * extra clicks are swallowed. See HOU-464.
 *
 * Gated on `!hasDetail` so a background refetch of an already-open skill
 * (detail already on screen) doesn't re-flag its card as loading.
 */
export function resolveLoadingSkillName(
  selectedSkillName: string | null,
  detailFetching: boolean,
  hasDetail: boolean,
): string | null {
  if (!selectedSkillName || !detailFetching || hasDetail) return null;
  return selectedSkillName;
}
