"use client";

import { useCallback } from "react";
import {
  advanceConnect,
  advanceCredential,
  advanceCustom,
  advanceSignin,
  answerWithOption,
  answerWithText,
  type ChatInteractionAnswer,
  type ChatInteractionStep,
  type StepperState,
  skipStep,
  type Transition,
} from "./interaction-card-logic";
import type { StepperUpdate } from "./use-stepper-state";

/** Every way the current step can be left, bound to the live state. The four
 *  `on<Done>` reports come from an app-supplied body (connect, sign-in,
 *  credential, custom) and carry no disabled guard: the body decides whether it
 *  can fire at all. */
export interface StepperTransitions {
  onOption: (optionId: string) => void;
  onSend: () => void;
  onSkip: () => void;
  onConnected: () => void;
  onSignedIn: () => void;
  onSaved: () => void;
  onDone: () => void;
}

export function useStepperTransitions({
  steps,
  current,
  disabled,
  update,
  onComplete,
}: {
  steps: ChatInteractionStep[];
  /** The step these callbacks are created for — the index the card renders. */
  current: number;
  disabled: boolean;
  update: StepperUpdate;
  onComplete: (answers: ChatInteractionAnswer[]) => void;
}): StepperTransitions {
  const originId = steps[current]?.id;
  // Transitions are DERIVED from the latest state, never from the render-time
  // one: a handler may write a draft and then leave the step in the same batch
  // (`onDraftChange` then `onDone`), and a value computed from the stale render
  // state would drop that draft. `update` resolves the updater synchronously
  // against its ref, so `completed` is already set when it returns.
  const apply = useCallback(
    (fn: (prev: StepperState) => Transition) => {
      let completed: ChatInteractionAnswer[] | undefined;
      update((prev) => {
        // ...but bound to the step it was created for: an app holds these
        // callbacks across steps (a connect step's OAuth hand-off can resolve
        // long after the user paged on), and a late report must leave the step
        // now under the pager alone rather than complete it unanswered.
        if (steps[prev.current]?.id !== originId) return prev;
        const t = fn(prev);
        completed = t.completed;
        return t.state;
      });
      if (completed) onComplete(completed);
    },
    [onComplete, originId, steps, update],
  );

  const onOption = useCallback(
    (optionId: string) => {
      if (disabled) return;
      apply((prev) => answerWithOption(prev, steps, optionId));
    },
    [apply, disabled, steps],
  );

  const onSend = useCallback(() => {
    if (disabled) return;
    apply((prev) => answerWithText(prev, steps));
  }, [apply, disabled, steps]);

  const onSkip = useCallback(() => {
    if (disabled) return;
    apply((prev) => skipStep(prev, steps));
  }, [apply, disabled, steps]);

  const onConnected = useCallback(() => {
    apply((prev) => advanceConnect(prev, steps));
  }, [apply, steps]);

  const onSignedIn = useCallback(() => {
    apply((prev) => advanceSignin(prev, steps));
  }, [apply, steps]);

  const onSaved = useCallback(() => {
    apply((prev) => advanceCredential(prev, steps));
  }, [apply, steps]);

  const onDone = useCallback(() => {
    apply((prev) => advanceCustom(prev, steps));
  }, [apply, steps]);

  return {
    onConnected,
    onDone,
    onOption,
    onSaved,
    onSend,
    onSignedIn,
    onSkip,
  };
}
