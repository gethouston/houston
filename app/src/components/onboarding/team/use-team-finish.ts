import { durationMs } from "@houston/design-tokens";
import { useEffect, useRef, useState } from "react";
import { fireSetupConfetti } from "../../../lib/confetti";
import { finishStep, type TeamFinishState } from "./team-roster-model";

/** How long the card holds on its finished team while the confetti rises,
 *  before handing over. */
const CELEBRATION_MS = durationMs.bounce;

export interface TeamFinish {
  /** Finish the card: at once when every hire and edit has landed, or as
   *  soon as the last one still on its way does. Edits whose save failed are
   *  sent again first. */
  request: () => void;
  /** A finish is pressed and waiting, or celebrating. */
  busy: boolean;
}

/**
 * Finishing the card, the one moment that waits on the host: a team is only
 * handed over once everyone on it exists with what the card shows. A create
 * or a save that fails gives the press up, and its card says why: a create's
 * badge carries the Retry, and pressing again sends a failed save again.
 *
 * A finished team is celebrated (confetti, which already honors reduced
 * motion) for a beat before `onDone`.
 */
export function useTeamFinish(
  state: TeamFinishState,
  retrySaves: () => void,
  onDone: () => void,
): TeamFinish {
  const [requested, setRequested] = useState(false);
  const celebrated = useRef(false);
  const latestOnDone = useRef(onDone);
  latestOnDone.current = onDone;
  const step = requested ? finishStep(state) : null;

  useEffect(() => {
    if (step === "cancel") {
      setRequested(false);
      return;
    }
    if (step !== "finish") return;
    // The timer is re-armed on every run (a dev double-mount clears the
    // first), the confetti fires once.
    if (!celebrated.current) {
      celebrated.current = true;
      fireSetupConfetti();
    }
    const timer = setTimeout(() => latestOnDone.current(), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [step]);

  return {
    request: () => {
      retrySaves();
      setRequested(true);
    },
    busy: requested,
  };
}
