/**
 * The single-card move-to-done celebration, in one place: the card checkmark
 * and the drag-to-Done drop, on both the per-agent board and cross-agent
 * Mission Control, all run the same two-step.
 */

import {
  type ConfettiOrigin,
  fireMissionDoneConfetti,
  missionCardOrigin,
} from "./confetti.ts";
import { celebratesMissionDone } from "./mission-selection.ts";

/** The parts of a board card this celebration reads. Structural on purpose, so
 *  it takes a `KanbanItem` without this module knowing the board's types. */
interface CelebratedItem {
  id: string;
  status: string;
}

/**
 * Arm the celebration for moving ONE mission to `targetStatus`: measures the
 * card where it sits right now and hands back the burst to fire once the write
 * has landed.
 *
 * The split is the whole point. The card has to be measured BEFORE the
 * mutation — a successful move re-renders it into the Done column, so a lookup
 * afterwards would either miss the node or read its new home, and the confetti
 * would come from the wrong place. The returned burst must be fired only AFTER
 * the write resolves, so a celebration can never claim a mission finished when
 * the write was rejected.
 *
 * A move that isn't a finish (anything but Done, or a mission that ended in
 * `error` — see `celebratesMissionDone`) arms nothing: the returned function is
 * a no-op, and no DOM is touched. A card that can't be found still celebrates,
 * from the default bottom-of-board origin.
 */
export function armMissionDoneCelebration(
  item: CelebratedItem,
  targetStatus: string,
): () => void {
  const celebrates = celebratesMissionDone(targetStatus, [item.status]);
  const origin: ConfettiOrigin | undefined = celebrates
    ? missionCardOrigin(item.id)
    : undefined;
  return () => {
    if (celebrates) fireMissionDoneConfetti(origin);
  };
}
