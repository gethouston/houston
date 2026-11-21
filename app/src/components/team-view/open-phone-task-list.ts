import { useUIStore } from "../../stores/ui";
import { phoneTaskListReturn } from "./team-section-tabs-model";

export function openPhoneTaskList(agentId: string): void {
  const ui = useUIStore.getState();
  if (phoneTaskListReturn(ui.navStack, ui.navIndex, agentId) === "pop")
    ui.navBack();
  else ui.openAgentsHome(agentId, { nav: "replace" });
}
