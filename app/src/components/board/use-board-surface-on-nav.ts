import { useEffect, useRef } from "react";
import {
  type BoardSurface,
  pendingMissionSurface,
  type SurfaceRow,
  surfaceOnActivate,
} from "../../lib/board-surface-nav";
import { useUIStore } from "../../stores/ui";
import { useIsActiveView } from "../shell/keep-alive-views";

export function useBoardSurfaceOnNav({
  rows,
  show,
}: {
  rows: readonly SurfaceRow[] | undefined;
  show: (surface: BoardSurface) => void;
}): void {
  const isActiveScreen = useIsActiveView();
  const pendingId = useUIStore((s) => s.activityPanelId);
  const surface = pendingMissionSurface(rows, pendingId);
  const wasActiveScreen = useRef(isActiveScreen);

  useEffect(() => {
    const cameBack = isActiveScreen && !wasActiveScreen.current;
    wasActiveScreen.current = isActiveScreen;
    if (!isActiveScreen) return;
    if (cameBack) {
      show(surfaceOnActivate(surface));
      return;
    }
    if (surface) show(surface);
  }, [isActiveScreen, surface, show]);
}
