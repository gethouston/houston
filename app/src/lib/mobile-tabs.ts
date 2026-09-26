/**
 * The phone nav bar's model: which of its two items the current location
 * lights up.
 *
 * The bar is a Linear-style floating pill with two entries, AI Employees and
 * More, plus a separate round compose button. AI Employees is a TREE: it roots
 * on the employee list and holds every employee drill-in below it. More is a
 * MENU over the shell (the workspace switcher, the long tail of destinations,
 * help), so it lights for every location the tree does not own rather than
 * naming a screen of its own.
 *
 * Pure and store-free so the rule is unit-tested (`app/tests/mobile-tabs.
 * test.ts`); the imperative side, which reads the stores and dispatches a
 * tap, is `lib/open-mobile-tab.ts` — the same split as `agent-nav.ts` /
 * `open-agent.ts`.
 */

import {
  AGENT_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  ASSISTANT_VIEW_ID,
} from "./top-level-views.ts";

export type MobileTabId = "agents" | "more";

/**
 * Which item the current location belongs to. The employee list and an
 * employee's own screen light AI Employees. Everything else (the Store,
 * Skills, Settings, the Academy, the AI hub, ...) is reached through the More
 * menu, so it lights More and no location leaves the bar dark.
 */
export function activeMobileTab(ui: { viewMode: string }): MobileTabId {
  if (ui.viewMode === AGENTS_HOME_VIEW_ID || ui.viewMode === AGENT_VIEW_ID)
    return "agents";
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
