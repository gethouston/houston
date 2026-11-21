"use client";

import { useCallback, useMemo } from "react";
import {
  type ChatInteractionStep,
  type StepperState,
  setDraft,
} from "./interaction-card-logic";
import { normalizeAnswer } from "./interaction-card-model";
import { claimFiles, stepFiles } from "./interaction-file-claim";
import type { StepperUpdate } from "./use-stepper-state";

const NO_FILES: readonly File[] = [];

export function useFileAnswer(args: {
  state: StepperState;
  update: StepperUpdate;
  step: ChatInteractionStep | undefined;
  selectedId: string | null;
  draft: string;
  files: readonly File[] | undefined;
  attachedAnswer: string;
  onSend: () => void;
}): {
  fileAnswer: boolean;
  onSendAnswer: () => void;
  stepFiles: readonly File[];
} {
  const { state, update, step, selectedId, draft, attachedAnswer } = args;
  const { onSend } = args;
  const files = args.files ?? NO_FILES;
  const stepId = step?.id ?? "";
  const wantsFiles = step?.kind === "question" && step.wantsFiles === true;
  const mine = useMemo(
    () => stepFiles(state.fileClaims, stepId, files),
    [state.fileClaims, stepId, files],
  );
  const filesHere = mine.files.length > 0 && (wantsFiles || mine.exclusive);
  const fileAnswer = filesHere && selectedId === null;
  const own = mine.files;
  const onSendAnswer = useCallback(() => {
    const typed = normalizeAnswer(draft);
    if (fileAnswer && typed === null) {
      update((s) =>
        setDraft(
          claimFiles(s, stepId, own, attachedAnswer),
          stepId,
          attachedAnswer,
        ),
      );
    } else if (fileAnswer && wantsFiles && typed !== null) {
      update((s) => claimFiles(s, stepId, own, typed));
    }
    onSend();
  }, [
    fileAnswer,
    wantsFiles,
    draft,
    update,
    stepId,
    own,
    attachedAnswer,
    onSend,
  ]);
  return { fileAnswer, onSendAnswer, stepFiles: own };
}
