/**
 * The mobile bottom tab bar's model: which of the three tabs the current
 * location lights up.
 *
 * The adopted mobile IA is three tabs — Agents (the landing tab), Mission
 * Control (the board, labelled "Tasks" in copy), Settings. Chat is never a
 * tab, new missions start from the top bar's compose button, and the long
 * tail (Store, Skills, workspaces, ...) stays in the drawer.
 *
 * Pure and store-free so the rule is unit-tested (`app/tests/mobile-tabs.
 * test.ts`); the imperative side, which reads the stores and dispatches a
 * tap, is `lib/open-mobile-tab.ts` — the same split as `agent-nav.ts` /
 * `open-agent.ts`.
 */

import type { TeamSectionId } from "./teams-model.ts";
import { isMissionBoardSurface, SETTINGS_VIEW_ID } from "./top-level-views.ts";

export type MobileTabId = "agents" | "mission-control" | "settings";

/**
 * Which tab the current location belongs to. Settings is its own screen; a
 * team board NOT narrowed to one agent is Mission Control; everything else is
 * Agents — the landing tab hosts the agent-focused board (until the dedicated
 * Agents home screen lands) and absorbs the drawer's long tail (Inbox, Store,
 * Skills, a team's Routines/Files, ...), so no location leaves the bar dark.
 */
export function activeMobileTab(ui: {
  viewMode: string;
  teamSection: TeamSectionId | null;
  teamAgentFocus: boolean;
}): MobileTabId {
  if (ui.viewMode === SETTINGS_VIEW_ID) return "settings";
  if (isMissionBoardSurface(ui) && !ui.teamAgentFocus) return "mission-control";
  return "agents";
}
