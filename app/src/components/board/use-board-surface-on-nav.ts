import { useEffect, useRef } from "react";
import {
  type BoardSurface,
  pendingMissionSurface,
  type SurfaceRow,
  surfaceOnActivate,
} from "../../lib/board-surface-nav";
import { useUIStore } from "../../stores/ui";
import { useIsActiveView } from "../shell/keep-alive-views";

/**
 * Put the right SURFACE of a mission board on screen — its active board or its
 * archive — mounted by the owner of the two (Mission Control, a team's Mission
 * Control section), the one component that survives the swap.
 *
 * It answers two questions, and they are one mechanism because both are
 * "which surface should be showing right now?":
 *
 * 1. **A navigation arrived.** Every "open this mission" handoff publishes its
 *    target as `activityPanelId` and lets the board on the glass consume it.
 *    The target's surface is decided from the RAW sweep rows
 *    ({@link pendingMissionSurface}) — never from a board's own items, which
 *    each hold half the workspace — and that surface is swapped in so the
 *    mission's owner can claim it. An @mention on an archived mission used to
 *    force the ACTIVE board on screen and open a null session behind a dead
 *    composer.
 * 2. **The board came back on the glass.** A kept-alive board the user left
 *    while looking at the archive is still mounted, archive and all. A genuine
 *    `viewMode` / team change therefore has to reset it
 *    ({@link surfaceOnActivate}) — the archive is somewhere you go, never
 *    somewhere you are returned to. Only the false→true edge of "am I visible"
 *    does this, so toggling the archive from the toolbar (Archived / Back),
 *    which never leaves the glass, is completely unaffected.
 *
 * `show` should be stable; asking for the surface already up is a no-op.
 */
export function useBoardSurfaceOnNav({
  rows,
  show,
}: {
  /** Raw sweep rows — the ONE place a target's surface is decided. */
  rows: readonly SurfaceRow[] | undefined;
  show: (surface: BoardSurface) => void;
}): void {
  const isActiveScreen = useIsActiveView();
  const pendingId = useUIStore((s) => s.activityPanelId);
  const surface = pendingMissionSurface(rows, pendingId);
  // Where the board was last time this ran, so an ARRIVAL (rule 2) is told
  // apart from a nav landing on a board that was already up (rule 1).
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
