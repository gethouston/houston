/**
 * "Take me to tab X's root", performed — the imperative half of
 * `lib/mobile-tabs.ts`, bound to the stores the way `open-agent.ts` binds
 * `agent-nav.ts`.
 *
 * A tab switch RESETS the nav stack to that tab's root (`NavMode` "reset"):
 * native tab semantics, where changing tabs abandons the old tab's trail.
 */

import { useUIStore } from "../stores/ui.ts";
import { currentTeams } from "./current-teams.ts";
import type { MobileTabId } from "./mobile-tabs.ts";
import { homeTeam, teamById } from "./teams-model.ts";
import { INBOX_VIEW_ID } from "./top-level-views.ts";

/** The team board reset behind the Tasks tab, or the Inbox when no team
 *  has resolved yet — the same teamless fallback every nav shares. */
function resetToBoard(teamId: string | null): void {
  const ui = useUIStore.getState();
  if (teamId === null) {
    ui.setViewMode(INBOX_VIEW_ID, { nav: "reset" });
    return;
  }
  ui.openTeamView(teamId, "mission-control", { nav: "reset" });
}

/**
 * Land on a tab's root. Any open chat panel closes first, through its owner
 * (the `navApplyHistory` pattern), so the rebuilt root entry is panel-less and
 * the owner's own release folds in as a no-op.
 *
 * Roots: Settings is its index; Mission Control is the open team's board (the
 * home team when none is open), unfiltered; Agents is the Agents home screen's
 * agent list — re-tapping the tab from a drilled agent pops back out to it.
 */
export function openMobileTab(tab: MobileTabId): void {
  const ui = useUIStore.getState();
  if (ui.missionPanelOpen) {
    const close = ui.onPanelClose;
    if (close) close();
    else ui.closeMissionPanel();
  }
  if (tab === "settings") {
    useUIStore.getState().openSettings(null, { nav: "reset" });
    return;
  }
  if (tab === "agents") {
    useUIStore.getState().openAgentsHome(null, { nav: "reset" });
    return;
  }
  const teams = currentTeams();
  const team =
    teamById(teams, useUIStore.getState().activeTeamId) ?? homeTeam(teams);
  resetToBoard(team?.id ?? null);
}
