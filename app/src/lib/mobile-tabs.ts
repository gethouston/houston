/**
 * The phone nav bar's model: which of the three items the current location
 * lights up.
 *
 * The bar is a Linear-style floating pill with three entries — Agents, Teams,
 * More — plus a separate round compose button. Two of them are TREES: Agents
 * roots on the agent list and its per-agent drill-ins, Teams roots on the
 * teams tree and its team sections. The third is not a place at all: "More" is
 * a MENU over the shell (the workspace switcher, the long tail of
 * destinations, help), so it lights for every location neither tree owns
 * rather than naming a screen of its own.
 *
 * Pure and store-free so the rule is unit-tested (`app/tests/mobile-tabs.
 * test.ts`); the imperative side, which reads the stores and dispatches a
 * tap, is `lib/open-mobile-tab.ts` — the same split as `agent-nav.ts` /
 * `open-agent.ts`.
 */

import {
  AGENTS_HOME_VIEW_ID,
  ASSISTANT_VIEW_ID,
  TEAM_VIEW_ID,
  TEAMS_HOME_VIEW_ID,
} from "./top-level-views.ts";

export type MobileTabId = "agents" | "teams" | "more";

/** The two items that ARE trees: the ones a tap navigates to. */
export type MobileNavTabId = Exclude<MobileTabId, "more">;

/**
 * Which item the current location belongs to. A team view lights Teams
 * whatever section is open and whether or not it is narrowed to one agent —
 * the section is a level INSIDE the Teams tree, not a different place.
 * Everything else (the Store, Skills, Settings, the Academy, the AI hub, ...)
 * is reached through the More menu, so it lights More and no location leaves
 * the bar dark.
 */
export function activeMobileTab(ui: { viewMode: string }): MobileTabId {
  if (ui.viewMode === AGENTS_HOME_VIEW_ID) return "agents";
  if (ui.viewMode === TEAM_VIEW_ID || ui.viewMode === TEAMS_HOME_VIEW_ID)
    return "teams";
  return "more";
}

/**
 * Whether the phone's bottom chrome (the floating nav bar with its compose
 * button) stays off the screen. Chat is a PUSH, not a tab: the pushed mission
 * chat and the board's full-screen mission panel drop the bar so the composer
 * sits on the bottom edge above the keyboard and the back affordances are the
 * way out. The assistant is a chat too, a 1-on-1 reached from the More menu
 * with its own back chevron, so it drops the bar for the same reason; left in
 * place it stacked a third row of controls under the composer, with a New
 * task button beside a chat that already has one.
 */
export function phoneChromeHidden(ui: {
  viewMode: string;
  chatAgentId: string | null;
  missionPanelOpen: boolean;
}): boolean {
  return (
    ui.chatAgentId !== null ||
    ui.missionPanelOpen ||
    ui.viewMode === ASSISTANT_VIEW_ID
  );
}
