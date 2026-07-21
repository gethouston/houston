"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  advanceApproval,
  advanceConnect,
  advanceCredential,
  advanceCustom,
  advanceSignin,
  answerWithOption,
  answerWithText,
  type ChatInteractionAnswer,
  type ChatInteractionStep,
  canGoForward,
  defaultProgress,
  draftFor,
  goBack,
  goForward,
  hasSelectableOptions,
  initialStepperState,
  selectedOptionId,
  setDraft,
  skipStep,
  type Transition,
} from "./interaction-card-logic";
import { QuestionStepBody } from "./interaction-card-parts";
import {
  InteractionModal,
  type InteractionModalPager,
  InteractionModalTitle,
} from "./interaction-modal";

export type {
  ChatInteractionAnswer,
  ChatInteractionOption,
  ChatInteractionStep,
} from "./interaction-card-logic";

type ConnectStep = Extract<ChatInteractionStep, { kind: "connect" }>;
type SigninStep = Extract<ChatInteractionStep, { kind: "signin" }>;
type ApprovalStep = Extract<ChatInteractionStep, { kind: "approval" }>;
type CredentialStep = Extract<ChatInteractionStep, { kind: "credential" }>;
type CustomStep = Extract<ChatInteractionStep, { kind: "custom" }>;

/** The chrome the shared {@link InteractionModal} needs, handed to a
 *  signin/connect body so it renders the SAME modal shell as a question step:
 *  the header pager (Back/Forward + progress) and the dismiss X. The body owns
 *  its own title (its `(icon) name` lockup), reason, and footer CTA. */
export interface StepChrome {
  pager: InteractionModalPager | null;
  onDismiss?: () => void;
  dismissLabel: string;
  disabled: boolean;
}

export interface ChatInteractionCardProps {
  /** The ordered interaction steps (>=1 total). Any mix of step kinds in any
   *  order — the stepper walks them front to back exactly as given; no kind is
   *  required to precede another. */
  steps: ChatInteractionStep[];
  /** Receives every question answer, in step order, once the last step is done. */
  onComplete: (answers: ChatInteractionAnswer[]) => void;
  /** Renders a connect step as its OWN {@link InteractionModal} — the `(icon)
   *  name` header title, the reason + muted app description body, and the
   *  footer's unified decline + Connect CTA — wiring the supplied {@link
   *  StepChrome} (pager + dismiss) into the shell so it matches every other
   *  step. Call `api.onConnected` once the connection lands. ui/chat stays
   *  Composio-unaware, so the app supplies the reactive content and identity. */
  renderConnect: (
    step: ConnectStep,
    api: StepFooterApi & StepChrome & { onConnected: () => void },
  ) => ReactNode;
  /** Renders a signin step as its OWN {@link InteractionModal} (see
   *  {@link renderConnect}); call `api.onSignedIn` to advance. ui/chat stays
   *  auth-unaware, so the app supplies the reactive sign-in content. */
  renderSignin: (
    step: SigninStep,
    api: StepFooterApi & StepChrome & { onSignedIn: () => void },
  ) => ReactNode;
  /** Renders an approval step as its OWN {@link InteractionModal} (see
   *  {@link renderConnect}): the action's `(icon) name` header, the param rows,
   *  and the footer's Deny + Allow CTAs. Both Allow and Deny resolve the step —
   *  the APP records which decision before calling `api.onResolve` to advance.
   *  ui/chat stays Composio-unaware, so the app supplies the reactive card. */
  renderApproval: (
    step: ApprovalStep,
    api: StepFooterApi & StepChrome & { onResolve: () => void },
  ) => ReactNode;
  /** Renders a credential step as its OWN {@link InteractionModal} (see
   *  {@link renderConnect}): the integration's `(icon) name` header, the reason
   *  line + a secure key field body, and the footer's unified decline + Save
   *  CTA. Call `api.onSaved` once the secret is stored to advance; `api.onSkip`
   *  declines the key like any sibling. ui/chat stays integration-unaware, so
   *  the app supplies the reactive, secure key-entry card. */
  renderCredential: (
    step: CredentialStep,
    api: StepFooterApi & StepChrome & { onSaved: () => void },
  ) => ReactNode;
  /** Renders a custom step as its OWN {@link InteractionModal} (see
   *  {@link renderConnect}): a fully app-supplied body wired with the {@link
   *  StepChrome} this stepper hands it. ui/chat owns none of the content — the
   *  renderer owns the modal's title, body, and footer. Call `api.onDone` to
   *  advance past the step. Optional; when a custom step is present but no
   *  `renderCustom` is supplied, the card renders defensively nothing. */
  renderCustom?: (
    step: CustomStep,
    api: StepFooterApi & StepChrome & { onDone: () => void },
  ) => ReactNode;
  /** Dismisses the WHOLE interaction sequence. When omitted, the header shows no
   *  dismiss (X) button. */
  onDismiss?: () => void;
  disabled?: boolean;
  labels?: {
    /** Free-text answer field on a free-text-only question (no options). */
    placeholder?: string;
    /** Free-text ESCAPE row placeholder, shown when the question also offers
     *  options ("Type another option..."). Falls back to `placeholder`. */
    escapePlaceholder?: string;
    /** The unified card-wide decline word, one label for declining a question
     *  AND declining a signin/connect ("Skip"). */
    skip?: string;
    /** aria-label of the free-text field's arrow-up send button ("Send"). */
    send?: string;
    /** The keycap hint beside the decline ("Esc"). */
    esc?: string;
    /** aria-label of the pager's back chevron. */
    back?: string;
    /** aria-label of the pager's forward chevron. */
    forward?: string;
    dismiss?: string;
    /** The soft "Recommended" chip beside a marked option's label. */
    recommended?: string;
    /** Pager progress copy, e.g. "1 of 3" (shown for a multi-step sequence). */
    progress?: (current: number, total: number) => string;
  };
}

/** The step-scoped api the card hands a signin/connect body. Navigation is NOT
 *  here — the header pager owns Back/Forward for every step kind. The body only
 *  needs:
 *  - `revisited`: true when the user walked BACK onto this already-reached step
 *    (via the pager). A revisited step that is already COMPLETED drops its CTA
 *    (the pager's forward chevron is the way onward) and stops auto-reporting
 *    its own completion; a revisited SKIPPED step keeps its CTA — and its paired
 *    decline — so the user can reconsider and complete it, or decline again.
 *  - `onSkip`: decline this step WITHOUT completing it, recording the skip so
 *    the composed reply tells the agent the user declined. Offered wherever the
 *    CTA is (frontier AND a reconsidered/revisited skip), so the decline
 *    affordance always travels with the CTA. */
export interface StepFooterApi {
  revisited: boolean;
  onSkip: () => void;
}

/**
 * The in-chat surface shown when the agent pauses to gather what it needs before
 * continuing: a stepper that walks the user through ONE step at a time, front to
 * back in the order the steps are given (any mix of kinds), each rendered in the
 * shared {@link InteractionModal} shell. The shell owns the chrome (surface,
 * header row, footer row); the stepper decides what fills the title / body /
 * footer for the current step.
 *
 * A question step routes its text into the modal TITLE, renders its option rows
 * (LEFT number badge = keyboard shortcut, regular-weight label, optional
 * Recommended chip) plus the free-text ESCAPE field as the body, and puts the
 * card-wide decline ("Skip" + Esc) ALONE in the footer — questions have no
 * primary CTA because clicking an option answers and advances. Typing + Enter in
 * the escape field submits; "Skip" (or Esc) skips the step.
 *
 * A signin/connect/approval step's reactive body — its `(icon) name` header
 * title, the reason/params body, and the footer's decline + filled CTA — is
 * app-supplied via `renderSignin` / `renderConnect` / `renderApproval`, which
 * render their OWN {@link InteractionModal} wired with the {@link StepChrome}
 * this stepper hands them, so the card stays Composio/auth-unaware while every
 * step shares one shell.
 * It renders ABOVE the real composer (which the caller keeps mounted alongside
 * it) — typing directly into that composer is the caller's implicit abandon.
 */
export function ChatInteractionCard({
  steps,
  onComplete,
  renderConnect,
  renderSignin,
  renderApproval,
  renderCredential,
  renderCustom,
  onDismiss,
  disabled = false,
  labels,
}: ChatInteractionCardProps) {
  const [state, setState] = useState(initialStepperState);

  const total = steps.length;
  const current = Math.min(state.current, total - 1);
  const step = steps[current];
  const neutralPlaceholder = labels?.placeholder ?? "Type another option...";
  const escapePlaceholder = labels?.escapePlaceholder ?? neutralPlaceholder;
  const backLabel = labels?.back ?? "Back";
  const forwardLabel = labels?.forward ?? "Forward";
  const skipLabel = labels?.skip ?? "Skip";
  const sendLabel = labels?.send ?? "Send";
  const escLabel = labels?.esc ?? "Esc";
  const dismissLabel = labels?.dismiss ?? "Dismiss";
  const recommendedLabel = labels?.recommended ?? "Recommended";
  const progress = labels?.progress ?? defaultProgress;

  const apply = useCallback(
    (t: Transition) => {
      setState(t.state);
      if (t.completed) onComplete(t.completed);
    },
    [onComplete],
  );

  const stepId = step?.id ?? "";
  const draft = draftFor(state, stepId);
  const selectedId =
    step?.kind === "question" ? selectedOptionId(state, stepId) : null;

  const onOption = useCallback(
    (optionId: string) => {
      if (disabled) return;
      apply(answerWithOption(state, steps, optionId));
    },
    [apply, disabled, state, steps],
  );

  const onSend = useCallback(() => {
    if (disabled) return;
    apply(answerWithText(state, steps));
  }, [apply, disabled, state, steps]);

  const onSkip = useCallback(() => {
    if (disabled) return;
    apply(skipStep(state, steps));
  }, [apply, disabled, state, steps]);

  const isQuestion = step?.kind === "question";

  // Number-key shortcuts (1, 2, 3...) select the matching option row, and Esc
  // declines the question (mirroring the footer's Esc hint) — both only on a
  // question step and while focus is NOT in a text field, so typing into the
  // free-text answer or the real composer is unaffected. Esc runs in the CAPTURE
  // phase and stops the event dead so it decides "not now" here instead of
  // falling through to the global Escape-closes-the-panel shortcut.
  useEffect(() => {
    if (disabled || !isQuestion) return;
    const options = (step?.kind === "question" && step.options) || [];
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable;
      if (isEditable) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onSkip();
        return;
      }
      const option = options[Number(e.key) - 1];
      if (!option) return;
      e.preventDefault();
      onOption(option.id);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [disabled, isQuestion, step, onOption, onSkip]);

  const onConnected = useCallback(() => {
    apply(advanceConnect(state, steps));
  }, [apply, state, steps]);

  const onSignedIn = useCallback(() => {
    apply(advanceSignin(state, steps));
  }, [apply, state, steps]);

  const onResolve = useCallback(() => {
    apply(advanceApproval(state, steps));
  }, [apply, state, steps]);

  const onSaved = useCallback(() => {
    apply(advanceCredential(state, steps));
  }, [apply, state, steps]);

  const onDone = useCallback(() => {
    apply(advanceCustom(state, steps));
  }, [apply, state, steps]);

  if (!step) return null;

  // The pager chevrons ARE the step navigation for every kind: back walks to the
  // previous already-reached step, forward re-advances toward the frontier past
  // an already-reached step (the only way onward from a revisited completed
  // signin/connect step, whose card can't re-fire its own completion).
  const onBack = !disabled && current > 0 ? () => setState(goBack) : null;
  const onForward =
    !disabled && canGoForward(state) ? () => setState(goForward) : null;

  const pager: InteractionModalPager | null =
    total > 1
      ? {
          current: current + 1,
          total,
          label: progress(current + 1, total),
          onBack,
          onForward,
          backLabel,
          forwardLabel,
        }
      : null;

  const chrome: StepChrome = { pager, onDismiss, dismissLabel, disabled };
  const footerApi: StepFooterApi = { revisited: canGoForward(state), onSkip };

  if (step.kind === "signin") {
    return renderSignin(step, { ...footerApi, ...chrome, onSignedIn });
  }
  if (step.kind === "connect") {
    return renderConnect(step, { ...footerApi, ...chrome, onConnected });
  }
  if (step.kind === "approval") {
    return renderApproval(step, { ...footerApi, ...chrome, onResolve });
  }
  if (step.kind === "credential") {
    return renderCredential(step, { ...footerApi, ...chrome, onSaved });
  }
  if (step.kind === "custom") {
    // ui/chat owns none of the content; a missing renderCustom means the app
    // shipped a custom step without wiring its renderer, so render nothing
    // rather than crash.
    return renderCustom
      ? renderCustom(step, { ...footerApi, ...chrome, onDone })
      : null;
  }

  const optionsPresent = hasSelectableOptions(step.options);

  return (
    <InteractionModal
      contentKey={step.id}
      disabled={disabled}
      dismissLabel={dismissLabel}
      onDismiss={onDismiss}
      pager={pager}
      title={
        <InteractionModalTitle className="text-balance">
          {step.question}
        </InteractionModalTitle>
      }
      body={
        <QuestionStepBody
          disabled={disabled}
          draft={draft}
          hideFreeText={optionsPresent && step.hideFreeText === true}
          onDraftChange={(value) => setState((s) => setDraft(s, stepId, value))}
          onOption={onOption}
          onSubmit={onSend}
          options={step.options}
          placeholder={optionsPresent ? escapePlaceholder : neutralPlaceholder}
          recommendedLabel={recommendedLabel}
          selectedId={selectedId}
          sendLabel={sendLabel}
          skip={{ label: skipLabel, escLabel, onSkip, disabled }}
        />
      }
    />
  );
}
