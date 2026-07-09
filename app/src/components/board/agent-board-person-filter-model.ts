/**
 * Reconcile a reused board tab's person-filter selection across agent switches.
 *
 * Pure + store-free so it's unit-testable, mirroring `resolvePendingActivitySelection`
 * (the sibling render-phase reset in {@link useAgentBoardSource}). The board tab
 * is keyed by tab, not agent, so the filter hook instance is REUSED when the user
 * switches agents; `filterUserId` is a teammate on the PREVIOUS agent's roster.
 *
 * Carrying it over filters the new agent's board by someone who may not be on any
 * of its missions — the board renders empty and the filter trigger shows a person
 * absent from the new agent's roster. So on a path (agent) change the selection
 * resets to Everyone (`null`); with no switch it survives, since text search, plain
 * re-renders, and data refreshes must not silently drop the user's chosen person.
 *
 * The caller feeds the returned value both to state AND to the filter it renders
 * this frame, so the reset lands before the filtered board commits (no one-frame
 * empty flash of the previous agent's selection).
 */
export function reconcileBoardFilterUserId({
  trackedPath,
  path,
  filterUserId,
}: {
  /** Agent path this hook instance last reconciled to. */
  trackedPath: string;
  /** Agent path being rendered now. */
  path: string;
  /** The currently selected person, or `null` for Everyone. */
  filterUserId: string | null;
}): string | null {
  return trackedPath === path ? filterUserId : null;
}
