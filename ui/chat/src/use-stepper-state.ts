"use client";

import { useCallback, useRef, useState } from "react";
import {
  initialStepperState,
  type StepperState,
} from "./interaction-card-logic";

/** Apply a stepper state, or derive it from the latest one. */
export type StepperUpdate = (
  next: StepperState | ((prev: StepperState) => StepperState),
) => void;

/**
 * The stepper's state plumbing, controlled or not. `controlled`, when supplied,
 * is the state the card renders; `onStateChange` receives EVERY transition; a
 * ref tracks the last state from either source, so a caller can park the
 * reported state, hand it back after a remount, and drop the prop again without
 * losing a step. `internal` exists only to schedule a re-render on `update`.
 *
 * A function updater resolves against a ref rather than the render-time state:
 * two updates landing in one React batch (typing into a step's free-text row and
 * moving the pager from the same click) must COMPOSE, and the render-time state
 * is the same stale value for both of them.
 */
export function useStepperState(
  controlled: StepperState | undefined,
  onStateChange?: (state: StepperState) => void,
): [StepperState, StepperUpdate] {
  const [internal, setInternal] = useState(initialStepperState);
  // The ref, not `internal`, is the uncontrolled fallback: a controlled state
  // handed in and then dropped before any local transition never reached
  // `setInternal`, so `internal` is still the initial state at that point.
  // Writing the ref during render holds only while `controlled` is a
  // synchronous external-store read (zustand), never a value deferred by a
  // transition or retried under Suspense: a discarded render would rewind the
  // ref, and the next functional update would compose against the rewound
  // value.
  const latest = useRef(internal);
  if (controlled !== undefined) latest.current = controlled;
  const state = controlled ?? latest.current;
  const update = useCallback<StepperUpdate>(
    (next) => {
      const resolved = typeof next === "function" ? next(latest.current) : next;
      // An origin-guarded transition hands back the very state it was given
      // (a late callback fired from a step the user already left): nothing
      // moved, so neither the render nor the subscriber is disturbed.
      if (resolved === latest.current) return;
      latest.current = resolved;
      setInternal(resolved);
      onStateChange?.(resolved);
    },
    [onStateChange],
  );
  return [state, update];
}
