// The public surface of ChatInteractionCard: the props the app passes and the
// two per-step apis the card hands a renderer. Kept apart from the component so
// the contract reads on its own and the component file stays the stepper.

import type { ReactNode } from "react";
import type {
  ChatInteractionAnswer,
  ChatInteractionStep,
  StepperState,
} from "./interaction-card-logic";
import type { InteractionModalPager } from "./interaction-modal";

type ConnectStep = Extract<ChatInteractionStep, { kind: "connect" }>;
type SigninStep = Extract<ChatInteractionStep, { kind: "signin" }>;
type CredentialStep = Extract<ChatInteractionStep, { kind: "credential" }>;
type CustomStep = Extract<ChatInteractionStep, { kind: "custom" }>;
export type QuestionStep = Extract<ChatInteractionStep, { kind: "question" }>;

/** The chrome the shared `InteractionModal` needs, handed to a
 *  signin/connect body so it renders the SAME modal shell as a question step:
 *  the header pager (Back/Forward + progress) and the dismiss X. The body owns
 *  its own title (its `(icon) action` lockup), reason, footer CTA, and the
 *  trailing free-text escape row below the footer. */
export interface StepChrome {
  pager: InteractionModalPager | null;
  onDismiss?: () => void;
  dismissLabel: string;
  collapseLabel: string;
  expandLabel: string;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
 *    affordance always travels with the CTA.
 *  - `draft` / `onDraftChange`: the free-text instruction typed on THIS step,
 *    parked in the stepper state like a question's draft — bind the trailing
 *    free-text row to them and the text survives the card being remounted. A
 *    skip keeps it: it is what the caller relays to the agent. */
export interface StepFooterApi {
  revisited: boolean;
  onSkip: () => void;
  draft: string;
  onDraftChange: (text: string) => void;
}

/** Flat, already-translated copy for every string the card renders. */
export interface ChatInteractionCardLabels {
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
  collapse?: string;
  expand?: string;
  /** The soft "Recommended" chip beside a marked option's label. */
  recommended?: string;
  /** Pager progress copy, e.g. "1 of 3" (shown for a multi-step sequence). */
  progress?: (current: number, total: number) => string;
}

export interface ChatInteractionCardProps {
  /** The ordered interaction steps (>=1 total). Any mix of step kinds in any
   *  order — the stepper walks them front to back exactly as given; no kind is
   *  required to precede another.
   *
   *  Step ids must be unique within the sequence: answers, drafts and the
   *  origin-bound step-leaving callbacks in `use-stepper-transitions.ts` all key
   *  on the id, so two steps sharing one collide and a late callback captured on
   *  either can advance the other. */
  steps: ChatInteractionStep[];
  /** Receives every question answer, in step order, once the last step is done. */
  onComplete: (answers: ChatInteractionAnswer[]) => void;
  /** Renders a connect step as its OWN `InteractionModal` — the `(icon)
   *  Connect <App>` header title, the reason body, the footer's unified
   *  decline + Connect CTA, and the trailing free-text row — wiring the supplied
   *  {@link StepChrome} (pager + dismiss) into the shell so it matches every
   *  other step. Call `api.onConnected` once the connection lands. ui/chat stays
   *  Composio-unaware, so the app supplies the reactive content and identity. */
  renderConnect: (
    step: ConnectStep,
    api: StepFooterApi & StepChrome & { onConnected: () => void },
  ) => ReactNode;
  /** Renders a signin step as its OWN `InteractionModal` (see
   *  {@link renderConnect}); call `api.onSignedIn` to advance. ui/chat stays
   *  auth-unaware, so the app supplies the reactive sign-in content. */
  renderSignin: (
    step: SigninStep,
    api: StepFooterApi & StepChrome & { onSignedIn: () => void },
  ) => ReactNode;
  /** Renders a credential step as its OWN `InteractionModal` (see
   *  {@link renderConnect}): the integration's `(icon) name` header, the reason
   *  line + a secure key field body, the footer's unified decline + Save
   *  CTA, and the trailing free-text row. Call `api.onSaved` once the secret is
   *  stored to advance; `api.onSkip` declines the key like any sibling. ui/chat
   *  stays integration-unaware, so the app supplies the reactive, secure
   *  key-entry card. */
  renderCredential: (
    step: CredentialStep,
    api: StepFooterApi & StepChrome & { onSaved: () => void },
  ) => ReactNode;
  /** Renders a custom step as its OWN `InteractionModal` (see
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
  /** Controlled stepper state (position, answers, free-text drafts). When
   *  supplied it is the state the card renders. The card keeps its internal
   *  state in sync either way and reports every transition through
   *  `onStateChange`, so a caller can park that state and hand it back after a
   *  remount (the app keeps it per conversation so a typed draft survives
   *  switching missions). */
  state?: StepperState;
  onStateChange?: (state: StepperState) => void;
  disabled?: boolean;
  labels?: ChatInteractionCardLabels;
}
