import { useUIStore } from "../stores/ui.ts";

export function openAgentsTab(): void {
  const ui = useUIStore.getState();
  if (ui.missionPanelOpen) {
    const close = ui.onPanelClose;
    if (close) close();
    else ui.closeMissionPanel();
  }
  useUIStore.getState().openAgentsHome(null, { nav: "reset" });
}
