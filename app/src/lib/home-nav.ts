/**
 * HOME: where the app opens, and where every fallback lands.
 *
 * There is no global mission board any more — every board belongs to a team —
 * so "home" is the FIRST team's Mission Control. The one exception is a caller
 * with no teams resolved yet (first paint, a workspace still loading, a space
 * with nothing in it): there is no board to send them to, so they land on the
 * Inbox, the one screen that needs no team.
 *
 * Every fallback in the app routes through here rather than naming a view of
 * its own: the dead-view guard, the blocked-team guard, ⌘N and the palette off
 * a board, an agent no team claims, Settings > Help, and the tour. One rule,
 * one place, so they can never drift into landing users somewhere different.
 */

import { useUIStore } from "../stores/ui.ts";
import { currentTeams } from "./current-teams.ts";
import { homeTeam } from "./teams-model.ts";
import { INBOX_VIEW_ID } from "./top-level-views.ts";

/**
 * Go home, reading the teams outside React.
 *
 * For store-free callers. Anything already holding `useTeams()` applies the
 * pure `homeTeam` itself rather than resolving the teams a second time — the
 * rule lives in `lib/teams-model.ts` beside the other team lookups, which is
 * also what keeps it unit-testable without the store chain.
 */
export function openHome(): void {
  const team = homeTeam(currentTeams());
  const ui = useUIStore.getState();
  if (team === null) {
    ui.setViewMode(INBOX_VIEW_ID);
    return;
  }
  ui.openTeamView(team.id, "mission-control");
}
