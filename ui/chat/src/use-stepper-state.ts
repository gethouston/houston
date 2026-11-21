"use client";

import { useCallback, useRef, useState } from "react";
import {
  initialStepperState,
  type StepperState,
} from "./interaction-card-logic";

export type StepperUpdate = (
  next: StepperState | ((prev: StepperState) => StepperState),
) => void;

export function useStepperState(
  controlled: StepperState | undefined,
  onStateChange?: (state: StepperState) => void,
): [StepperState, StepperUpdate] {
  const [internal, setInternal] = useState(initialStepperState);
  const latest = useRef(internal);
  if (controlled !== undefined) latest.current = controlled;
  const state = controlled ?? latest.current;
  const update = useCallback<StepperUpdate>(
    (next) => {
      const resolved = typeof next === "function" ? next(latest.current) : next;
      if (resolved === latest.current) return;
      latest.current = resolved;
      setInternal(resolved);
      onStateChange?.(resolved);
    },
    [onStateChange],
  );
  return [state, update];
}
