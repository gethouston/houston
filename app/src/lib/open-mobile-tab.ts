/**
 * "Take me to tab X's root", performed — the imperative half of
 * `lib/mobile-tabs.ts`, bound to the stores the way `open-agent.ts` binds
 * `agent-nav.ts`.
 *
 * A tab switch RESETS the nav stack to that tab's root (`NavMode` "reset"):
 * native tab semantics, where changing tabs abandons the old tab's trail.
 *
 * Only the two TREE items are here. "More" opens a menu over the shell rather
 * than navigating, so the bar toggles it directly and it never becomes a nav
 * entry — a menu the back button could pop would be a place, which it is not.
 */

import { useUIStore } from "../stores/ui.ts";
import type { MobileNavTabId } from "./mobile-tabs.ts";

/**
 * Land on a tab's root. Any open chat panel closes first, through its owner
 * (the `navApplyHistory` pattern), so the rebuilt root entry is panel-less and
 * the owner's own release folds in as a no-op.
 *
 * Roots: Agents is the Agents home screen's agent list, Teams is the Teams
 * home tree — re-tapping either from a drilled level pops back out to it.
 */
export function openMobileTab(tab: MobileNavTabId): void {
  const ui = useUIStore.getState();
  if (ui.missionPanelOpen) {
    const close = ui.onPanelClose;
    if (close) close();
    else ui.closeMissionPanel();
  }
  if (tab === "agents") {
    useUIStore.getState().openAgentsHome(null, { nav: "reset" });
    return;
  }
  useUIStore.getState().openTeamsHome({ nav: "reset" });
}
