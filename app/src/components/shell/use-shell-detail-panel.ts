import { useUIStore } from "../../stores/ui";
import { useDetailPanelContainer } from "./detail-panel-context";

/**
 * The one shell-level detail-panel wiring, shared by every surface that opens
 * the big right-hand panel: the Activity mission board (`mission-board.tsx`) and
 * the Routines tab's chat (`routines-tab.tsx`). It hands back the shell's portal
 * container (`workspace-shell` renders it as a sibling of `<main>` while
 * `missionPanelOpen` is true) plus the setter that toggles that flag.
 *
 * Both surfaces render into the SAME container through this hook, so the panel
 * is provably one UI path — there is no second, forked panel shell.
 */
export function useShellDetailPanel() {
  const panelContainer = useDetailPanelContainer();
  const setPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  return { panelContainer, setPanelOpen };
}
