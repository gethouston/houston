import { durationMs } from "@houston/design-tokens";
import { useEffect, useRef, useState } from "react";
import { fireSetupConfetti } from "../../../lib/confetti";
import { finishStep, type TeamFinishState } from "./team-roster-model";

const CELEBRATION_MS = durationMs.bounce;

export interface TeamFinish {
  request: () => void;
  busy: boolean;
}

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
