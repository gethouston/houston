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

/**
 * The in-chat surface shown when the agent pauses to gather what it needs before
 * continuing: a stepper that walks the user through ONE step at a time, front to
 * back in the order the steps are given (any mix of kinds), each rendered in the
 * shared `InteractionModal` shell. The shell owns the chrome (surface, header
 * row, footer row); the stepper decides what fills the title / body / footer for
 * the current step, and owns the state every step reads and writes — position,
 * committed answers, and the free-text draft typed on each step (see
 * `useStepperState` for how a caller parks and restores it).
 *
 * A signin/connect/credential/custom step's reactive body — its `(icon) name`
 * header title, the reason body, and the footer's decline + filled CTA — is
 * app-supplied via `renderSignin` / `renderConnect` / `renderCredential` /
 * `renderCustom`, which render their OWN `InteractionModal` wired with the
 * {@link StepChrome} this stepper hands them, so the card stays Composio/auth-
 * unaware while every step shares one shell. Every non-question step also
 * carries an always-visible free-text row (the app supplies it, trailing below
 * the footer actions): typing an instruction there and sending declines the step
 * WITH that message, which the caller relays to the agent. The caller seats this
 * card in the composer's slot (replacing it), so its per-step free-text row is
 * the one text input on screen; the card's dismiss X restores the composer.
 */
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
