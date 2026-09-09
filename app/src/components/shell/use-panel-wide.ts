import { useUIStore } from "../../stores/ui";
import { panelWideCapable } from "./detail-panel-owners";

/**
 * Whether the shell detail panel is the WIDE chat right now (PRODUCT-1722):
 * the panel takes the whole content row and `<main>` steps out of the
 * layout, the way the assistant's chat fills its screen.
 *
 * Two consents: the user's persisted preference (`chatWide`) AND a claim on
 * the panel from a surface that opted in (the mission chats). A setup
 * interview beside its catalog keeps the side layout whatever the preference
 * says. Desktop only by construction: the shell applies it under `md:`, and
 * below md the panel already covers the screen.
 */
export function usePanelWide(): boolean {
  const open = useUIStore((s) => s.missionPanelOpen);
  const chatWide = useUIStore((s) => s.chatWide);
  const capable = useUIStore((s) => panelWideCapable(s.missionPanelOwners));
  return open && chatWide && capable;
}
