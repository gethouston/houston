import { useEffect } from "react";
import type { BoardSurface } from "../../lib/board-surface-nav";
import { resolvePendingActivitySelection } from "../../lib/notification-nav";
import { useUIStore } from "../../stores/ui";
import { useIsActiveView } from "../shell/keep-alive-views";

/**
 * The cross-agent nav handoff, consumed by the surface that OWNS the mission.
 *
 * Every "open this mission" navigation — a session-finished notification, a
 * @mention row, the command palette's recent missions, the archived → active
 * handoff — publishes its target as `activityPanelId` and lets a board open it.
 * Two things decide who may:
 *
 * - **Only the screen on the glass.** Several kept-alive boards are mounted at
 *   once, and an unguarded consumer lets a hidden team's board eat the target
 *   and clear it.
 * - **Only the surface the target belongs to.** A board is two surfaces that
 *   swap — the active one and the archive — and each holds half the workspace.
 *   `pendingSurface` names the target's own surface, decided once from the raw
 *   sweep rows (`pendingMissionSurface`); a target belonging to the OTHER
 *   surface is left completely alone, published and unconsumed, so the owner of
 *   the two can swap boards and the right one can claim it.
 *
 * That second guard has to live HERE rather than in the owner because of
 * ordering: React runs child effects before parent effects, so this hook fires
 * a full commit BEFORE the owner's surface router (`useBoardSurfaceOnNav`) gets
 * a chance to route anything. Consuming first and asking later is what made an
 * archived @mention open a blank dead chat — the active board swallowed the
 * target and cleared it before the archive was ever asked for.
 */
export function usePendingMissionTarget({
  surface,
  pendingSurface,
  selectedId,
  setSelectedId,
  missionPanelOpen,
}: {
  /** Which of the board's two surfaces is calling. */
  surface: BoardSurface;
  /** The published target's own surface, or null when nothing is published. */
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
    // A passive nav must not yank the user out of an open conversation or
    // composer; an explicit one (a notification click) always may.
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
