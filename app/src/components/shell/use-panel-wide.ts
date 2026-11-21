import { useUIStore } from "../../stores/ui";
import { panelWideCapable } from "./detail-panel-owners";

export function usePanelWide(): boolean {
  const open = useUIStore((s) => s.missionPanelOpen);
  const chatWide = useUIStore((s) => s.chatWide);
  const capable = useUIStore((s) => panelWideCapable(s.missionPanelOwners));
  const previewing = useUIStore((s) => s.filePreview !== null);
  return open && (previewing || (chatWide && capable));
}
