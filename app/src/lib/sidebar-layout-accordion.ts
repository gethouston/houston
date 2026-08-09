import type { SidebarLayout } from "@houston-ai/engine-client";

import { blankOverlayGroup } from "./sidebar-layout-group-ops.ts";

/**
 * The rail's ACCORDION, the one layout op that touches every team at once.
 *
 * Its own module because it spans both halves of the layout — a named team's
 * `collapsed` lives on its stored group (`sidebar-layout-group-ops.ts`), the
 * virtual default team's lives on the layout itself
 * (`sidebar-layout-default-ops.ts`) — and because it is the only op driven by a
 * NAVIGATION rather than by a direct edit. Everything here is re-exported from
 * `sidebar-layout-ops.ts`, so callers still know one door.
 */

/** Which teams a solo-expand is being asked about. */
export interface ExpandOnlyTeam {
  /** The team to leave OPEN. */
  teamId: string;
  /** That team is the virtual DEFAULT one, whose fold lives on the layout
   *  itself rather than in `groups`. */
  isDefault: boolean;
  /** Every NAMED team the rail is currently drawing. Ids the layout has never
   *  seen are upserted, exactly as `toggleGroupCollapsedOp` does: on a
   *  server-teams host the overlay starts empty, so the first accordion click
   *  names ids it does not hold yet. */
  namedTeamIds: readonly string[];
}

/**
 * Fold every team shut except one, in ONE layout.
 *
 * The accordion is a single user gesture, so it must be a single write. Folding
 * the others by calling `toggleGroupCollapsedOp` per team would fire N PUTs off
 * one click, each racing the last through the same optimistic cache — and on a
 * slow link the rail would settle on whichever of them the host happened to
 * finish with.
 *
 * Groups the rail is NOT drawing are carried through untouched. They are either
 * another surface's rows or, on a server host, an overlay entry for a team
 * someone else deleted; neither is this click's business, and rule 7's decay is
 * the only thing allowed to retire them.
 */
export function expandOnlyTeamOp(
  layout: SidebarLayout,
  { teamId, isDefault, namedTeamIds }: ExpandOnlyTeam,
): SidebarLayout {
  const drawn = new Set(namedTeamIds);
  const known = new Set(layout.groups.map((group) => group.id));
  const groups = [
    ...layout.groups,
    ...namedTeamIds.filter((id) => !known.has(id)).map(blankOverlayGroup),
  ].map((group) =>
    drawn.has(group.id) ? { ...group, collapsed: group.id !== teamId } : group,
  );
  // The default team owns no group row, so its fold is the layout's own flag:
  // shut unless it is the one being opened.
  return { ...layout, groups, defaultCollapsed: !isDefault };
}
