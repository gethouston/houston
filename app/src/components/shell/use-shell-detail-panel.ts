import { useCallback, useEffect, useId } from "react";
import { useUIStore } from "../../stores/ui";
import { useDetailPanelContainer } from "./detail-panel-context";

export function useShellDetailPanel(opts?: { wide?: boolean }) {
  const panelContainer = useDetailPanelContainer();
  const ownerId = useId();
  const wide = opts?.wide === true;
  const setOwner = useUIStore((s) => s.setMissionPanelOwner);
  const setPanelOpen = useCallback(
    (open: boolean) => setOwner(ownerId, open, wide),
    [ownerId, setOwner, wide],
  );
  useEffect(() => () => setOwner(ownerId, false), [ownerId, setOwner]);
  return { panelContainer, setPanelOpen };
}
