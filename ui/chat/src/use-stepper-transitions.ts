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
  current: number;
  disabled: boolean;
  update: StepperUpdate;
  onComplete: (answers: ChatInteractionAnswer[]) => void;
}): StepperTransitions {
  const originId = steps[current]?.id;
  const apply = useCallback(
    (fn: (prev: StepperState) => Transition) => {
      let completed: ChatInteractionAnswer[] | undefined;
      update((prev) => {
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
