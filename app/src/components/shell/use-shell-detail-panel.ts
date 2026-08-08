import { useCallback, useEffect, useId } from "react";
import { useUIStore } from "../../stores/ui";
import { useDetailPanelContainer } from "./detail-panel-context";

/**
 * The one shell-level detail-panel wiring, shared by every surface that opens
 * the big right-hand panel: the mission board (`mission-board.tsx`), the
 * Routines section's chat (`team-view/team-routines/team-routine-panel.tsx`),
 * the Archived lists, and the
 * skill / integration setup chats. It hands back the shell's portal container
 * (`workspace-shell` renders it as a sibling of `<main>` while
 * `missionPanelOpen` is true) plus the setter that opens and closes it.
 *
 * Both surfaces render into the SAME container through this hook, so the panel
 * is provably one UI path — there is no second, forked panel shell.
 *
 * `setPanelOpen` is scoped to THIS caller's claim (see `detail-panel-owners`):
 * the panel is open while at least one surface claims it, so a hidden-but-
 * mounted screen releasing its claim can't clobber the screen the user just
 * opened, and a screen that stops rendering the panel can't strand it open and
 * empty.
 * Unmounting releases the claim automatically.
 */
export function useShellDetailPanel() {
  const panelContainer = useDetailPanelContainer();
  const ownerId = useId();
  const setOwner = useUIStore((s) => s.setMissionPanelOwner);
  const setPanelOpen = useCallback(
    (open: boolean) => setOwner(ownerId, open),
    [ownerId, setOwner],
  );
  useEffect(() => () => setOwner(ownerId, false), [ownerId, setOwner]);
  return { panelContainer, setPanelOpen };
}
