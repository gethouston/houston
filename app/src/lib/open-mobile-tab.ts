/**
 * "Take me to the AI Employees root", performed — the imperative half of
 * `lib/mobile-tabs.ts`, bound to the stores the way `open-agent.ts` binds
 * `agent-nav.ts`.
 *
 * The tap RESETS the nav stack to the list (`NavMode` "reset"): native tab
 * semantics, where re-tapping the tab abandons the trail below it.
 *
 * "More" is not here: it opens a menu over the shell rather than navigating,
 * so the bar toggles it directly and it never becomes a nav entry — a menu the
 * back button could pop would be a place, which it is not.
 */

import { useUIStore } from "../stores/ui.ts";

/**
 * Land on the AI Employees list. Any open chat panel closes first, through its
 * owner (the `navApplyHistory` pattern), so the rebuilt root entry is
 * panel-less and the owner's own release folds in as a no-op.
 */
export function openAgentsTab(): void {
  const ui = useUIStore.getState();
  if (ui.missionPanelOpen) {
    const close = ui.onPanelClose;
    if (close) close();
    else ui.closeMissionPanel();
  }
  useUIStore.getState().openAgentsHome(null, { nav: "reset" });
}
