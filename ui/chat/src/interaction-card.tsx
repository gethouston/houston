"use client";

import { useCallback, useEffect, useState } from "react";
import {
  canGoForward,
  defaultProgress,
  draftFor,
  goBack,
  goForward,
  selectedOptionId,
  setDraft,
} from "./interaction-card-logic";
import type {
  ChatInteractionCardProps,
  StepChrome,
  StepFooterApi,
} from "./interaction-card-props";
import type { InteractionModalPager } from "./interaction-modal";
import {
  InteractionQuestionStep,
  questionStepCopy,
} from "./interaction-question-step";
import { useCardAttachments } from "./use-card-attachments";
import { useFileAnswer } from "./use-file-answer";
import { useInteractionShortcuts } from "./use-interaction-shortcuts";
import { useStepperState } from "./use-stepper-state";
import { useStepperTransitions } from "./use-stepper-transitions";

export type {
  ChatInteractionAnswer,
  ChatInteractionBrand,
  ChatInteractionOption,
  ChatInteractionStep,
} from "./interaction-card-logic";
export type {
  ChatInteractionCardProps,
  StepChrome,
  StepFooterApi,
} from "./interaction-card-props";

export function ChatInteractionCard({
  steps,
  onComplete,
  renderConnect,
  renderSignin,
  renderCredential,
  renderCustom,
  onDismiss,
  state: controlled,
  onStateChange,
  disabled: disabledProp = false,
  completionKey,
  labels,
}: ChatInteractionCardProps) {
  const [state, update] = useStepperState(controlled, onStateChange);

  const total = steps.length;
  const current = Math.min(state.current, total - 1);
  const step = steps[current];
  const copy = questionStepCopy(labels);
  const progress = labels?.progress ?? defaultProgress;
  const { attach, complete, pending } = useCardAttachments(
    onComplete,
    completionKey,
  );
  const disabled = disabledProp || pending;
  const { onOption, onSend, onSkip, onConnected, onSignedIn, onSaved, onDone } =
    useStepperTransitions({
      current,
      disabled,
      onComplete: complete,
      steps,
      update,
    });

  const stepId = step?.id ?? "";
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (stepId) setOpen(true);
  }, [stepId]);
  const draft = draftFor(state, stepId);
  const selectedId =
    step?.kind === "question" ? selectedOptionId(state, stepId) : null;
  const onDraftChange = useCallback(
    (text: string) => update((s) => setDraft(s, stepId, text)),
    [stepId, update],
  );
  const { fileAnswer, onSendAnswer, stepFiles } = useFileAnswer({
    state,
    update,
    step,
    selectedId,
    draft,
    files: attach?.files,
    attachedAnswer: labels?.attachedAnswer ?? "See attached",
    onSend,
  });

  useInteractionShortcuts({
    active: !disabled && open,
    onOption,
    onSkip,
    step,
  });

  if (!step) return null;

  const pager: InteractionModalPager | null =
    total > 1
      ? {
          current: current + 1,
          total,
          label: progress(current + 1, total),
          onBack: !disabled && current > 0 ? () => update(goBack) : null,
          onForward:
            !disabled && canGoForward(state) ? () => update(goForward) : null,
          backLabel: labels?.back ?? "Back",
          forwardLabel: labels?.forward ?? "Forward",
        }
      : null;

  const chrome: StepChrome = {
    pager,
    onDismiss,
    dismissLabel: labels?.dismiss ?? "Dismiss",
    collapseLabel: labels?.collapse ?? "Collapse interaction",
    expandLabel: labels?.expand ?? "Expand interaction",
    disabled,
    open,
    onOpenChange: setOpen,
  };
  const footerApi: StepFooterApi = {
    revisited: canGoForward(state),
    onSkip,
    draft,
    onDraftChange,
  };

  if (step.kind === "signin") {
    return renderSignin(step, { ...footerApi, ...chrome, onSignedIn });
  }
  if (step.kind === "connect") {
    return renderConnect(step, { ...footerApi, ...chrome, onConnected });
  }
  if (step.kind === "credential") {
    return renderCredential(step, { ...footerApi, ...chrome, onSaved });
  }
  if (step.kind === "custom") {
    return renderCustom
      ? renderCustom(step, { ...footerApi, ...chrome, onDone })
      : null;
  }

  return (
    <InteractionQuestionStep
      attach={attach}
      chrome={chrome}
      copy={copy}
      draft={draft}
      fileAnswer={fileAnswer}
      onDraftChange={onDraftChange}
      onOption={onOption}
      onSend={onSendAnswer}
      onSkip={onSkip}
      selectedId={selectedId}
      step={step}
      stepFiles={stepFiles}
    />
  );
}
