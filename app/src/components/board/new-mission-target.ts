import type { Agent } from "../../lib/types.ts";

/**
 * Who a new task belongs to, before the composer opens.
 *
 * A team board is cross-agent, so "New task" cannot just open a composer — it
 * has to know whose. But asking is only honest when there is genuinely a
 * choice, and there often is not:
 *
 * - the board is PINNED to one agent, so the user already answered the
 *   question by narrowing the board they are looking at. Asking again is the
 *   app forgetting what it is showing;
 * - the team holds exactly ONE agent, so there is nothing to pick.
 *
 * In both cases the composer opens straight onto that agent. Only a genuinely
 * ambiguous board asks, and it asks with a MENU hung off the button rather
 * than a modal — a modal for "which of these three" stops the world for a
 * choice the user can make in place, and it covered the rail they were reading
 * the agents' names from a second ago.
 *
 * Pure, and unit-tested in `app/tests/new-mission-target.test.ts`.
 */

/** Where "New task" goes: straight to an agent, or to a menu of them. */
export type NewMissionTarget =
  | { kind: "direct"; agent: Agent }
  | { kind: "menu" };

/**
 * The rule, in order:
 *
 * 1. a pinned agent wins — the board is already narrowed to them;
 * 2. else a single scoped agent wins — there is no choice to offer;
 * 3. else the menu.
 *
 * An EMPTY scope also answers `menu`: a board with no agents has no composer
 * to open, and the caller's own empty state is what the user sees instead.
 */
export function newMissionTarget(
  pinnedAgent: Agent | null,
  scopedAgents: Agent[],
): NewMissionTarget {
  if (pinnedAgent) return { kind: "direct", agent: pinnedAgent };
  if (scopedAgents.length === 1)
    return { kind: "direct", agent: scopedAgents[0] };
  return { kind: "menu" };
}
