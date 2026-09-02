import { openMissionChat } from "../../lib/mission-chat";
import { startNewMission } from "../../lib/new-mission";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";

/**
 * A board's compose on the phone: the Running page's leading "+" and the
 * shortcut path both land here below the breakpoint, never in the desktop
 * side composer. THIS board's agents scope the "which agent?" question (the
 * desktop button asks the same scoped question): one agent pushes its empty
 * draft chat straight away, several open the roster sheet narrowed to them,
 * and an empty board falls back to the one shared rule.
 */
export function composeOnPhone(agents: Agent[]): void {
  if (agents.length === 1) {
    openMissionChat(agents[0], null);
    return;
  }
  if (agents.length > 1) {
    useUIStore.getState().setNewMissionSheetOpen(
      true,
      agents.map((a) => a.id),
    );
    return;
  }
  startNewMission();
}
