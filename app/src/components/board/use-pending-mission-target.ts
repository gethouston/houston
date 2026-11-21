import { useEffect } from "react";
import type { BoardSurface } from "../../lib/board-surface-nav";
import { resolvePendingActivitySelection } from "../../lib/notification-nav";
import { useUIStore } from "../../stores/ui";
import { useIsActiveView } from "../shell/keep-alive-views";

export function usePendingMissionTarget({
  surface,
  pendingSurface,
  selectedId,
  setSelectedId,
  missionPanelOpen,
}: {
  surface: BoardSurface;
  pendingSurface: BoardSurface | null;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  missionPanelOpen: boolean;
}): void {
  const isActiveScreen = useIsActiveView();
  const pendingId = useUIStore((s) => s.activityPanelId);
  const pendingForceOpen = useUIStore((s) => s.activityPanelForceOpen);
  const clearPending = useUIStore((s) => s.setActivityPanelId);
  useEffect(() => {
    if (!isActiveScreen || !pendingId) return;
    if (pendingSurface !== surface) return;
    const next = resolvePendingActivitySelection({
      pendingActivityId: pendingId,
      forceOpen: pendingForceOpen,
      selectedId,
      missionPanelOpen,
    });
    if (next) setSelectedId(next);
    clearPending(null);
  }, [
    isActiveScreen,
    pendingId,
    pendingSurface,
    surface,
    pendingForceOpen,
    selectedId,
    setSelectedId,
    missionPanelOpen,
    clearPending,
  ]);
}
