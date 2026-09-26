import { useUIStore } from "../../stores/ui";
import { phoneTaskListReturn } from "./team-section-tabs-model";

/**
 * Return from the employee's screen to its ONE phone task list (the AI
 * Employees drill-in): pop back to it when that is where the user came from,
 * replace the screen with it anywhere else ({@link phoneTaskListReturn}).
 */
export function openPhoneTaskList(agentId: string): void {
  const ui = useUIStore.getState();
  if (phoneTaskListReturn(ui.navStack, ui.navIndex, agentId) === "pop")
    ui.navBack();
  else ui.openAgentsHome(agentId, { nav: "replace" });
}
