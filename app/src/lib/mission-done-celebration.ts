import {
  type ConfettiOrigin,
  fireMissionDoneConfetti,
  missionCardOrigin,
} from "./confetti.ts";
import { celebratesMissionDone } from "./mission-selection.ts";

interface CelebratedItem {
  id: string;
  status: string;
}

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
