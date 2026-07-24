// The ChatInteractionCard stepper state machine: step advance/back, answer
// accumulation, completion and progress. Pure and DOM-free (mirroring
// chat-process-classes.ts) so the node:test suite can drive it without a DOM;
// the .tsx component re-uses these transitions and getters verbatim. Shared data
// types + stateless value helpers live in interaction-card-model.ts.

import {
  type ChatInteractionAnswer,
  type ChatInteractionStep,
  normalizeAnswer,
  optionLabel,
} from "./interaction-card-model.ts";

export type {
  ChatInteractionAnswer,
  ChatInteractionBrand,
  ChatInteractionOption,
  ChatInteractionStep,
} from "./interaction-card-model.ts";
export {
  hasSelectableOptions,
  normalizeAnswer,
  optionLabel,
} from "./interaction-card-model.ts";

/** A committed answer for one question step: the resolved text plus, when the
 *  user picked a choice, the option id (so a revisit can pre-select the row). */
export interface StepAnswer {
  answer: string;
  optionId: string | null;
}

/** Committed answers keyed by step id (question steps only). */
export type AnswerMap = Record<string, StepAnswer>;

/** Live free-text draft per step id (kept so a revisit restores typed text). */
export type DraftMap = Record<string, string>;

export interface StepperState {
  current: number;
  /** The furthest step the user has advanced to (the live frontier). Steps
   *  before it are already completed, so the user may walk forward through them
   *  again — critical for a revisited connect step, whose card never re-fires
   *  onConnected once the app is connected, leaving no other way forward. */
  reached: number;
  answers: AnswerMap;
  drafts: DraftMap;
}

/** The result of a transition: the next state plus, when the last step was
 *  just completed, the ordered question answers to hand to `onComplete`. */
export interface Transition {
  state: StepperState;
  completed?: ChatInteractionAnswer[];
}

export function initialStepperState(): StepperState {
  return { current: 0, reached: 0, answers: {}, drafts: {} };
}

export function isLastStep(index: number, total: number): boolean {
  return index >= total - 1;
}

/** Default pager copy, e.g. "1 of 3". */
export function defaultProgress(current: number, total: number): string {
  return `${current} of ${total}`;
}

/** The committed option id for the current step (pre-selects a row on revisit). */
export function selectedOptionId(
  state: StepperState,
  stepId: string,
): string | null {
  return state.answers[stepId]?.optionId ?? null;
}

/** The live draft text for the current step. */
export function draftFor(state: StepperState, stepId: string): string {
  return state.drafts[stepId] ?? "";
}

/** Send/advance is possible when a choice is selected OR the draft has text. */
export function canAdvanceQuestion(
  optionSelected: boolean,
  draft: string,
): boolean {
  return optionSelected || normalizeAnswer(draft) !== null;
}

/** The ordered question answers accumulated so far (connect steps produce none). */
export function toCompletedAnswers(
  steps: ChatInteractionStep[],
  answers: AnswerMap,
): ChatInteractionAnswer[] {
  const out: ChatInteractionAnswer[] = [];
  for (const step of steps) {
    if (step.kind !== "question") continue;
    const committed = answers[step.id];
    if (committed) {
      out.push({
        stepId: step.id,
        question: step.question,
        answer: committed.answer,
      });
    }
  }
  return out;
}

export function setDraft(
  state: StepperState,
  stepId: string,
  text: string,
): StepperState {
  return { ...state, drafts: { ...state.drafts, [stepId]: text } };
}

export function goBack(state: StepperState): StepperState {
  return { ...state, current: Math.max(0, state.current - 1) };
}

/** Can the user step forward through an already-completed step? True only when
 *  `current` sits behind the frontier (i.e. they walked back and can return). */
export function canGoForward(state: StepperState): boolean {
  return state.current < state.reached;
}

/** Re-advance toward the frontier without re-committing the current step. The
 *  escape hatch off a revisited connect step (its card can't re-fire onConnected
 *  once connected) and a shortcut past an already-answered question. */
export function goForward(state: StepperState): StepperState {
  return { ...state, current: Math.min(state.reached, state.current + 1) };
}

/** Advance past the current step, optionally committing a question answer.
 *  Returns `completed` when the current step is the last one. */
function advance(
  state: StepperState,
  steps: ChatInteractionStep[],
  commit?: { stepId: string; answer: StepAnswer; clearDraft: boolean },
): Transition {
  let answers = state.answers;
  let drafts = state.drafts;
  if (commit) {
    answers = { ...answers, [commit.stepId]: commit.answer };
    if (commit.clearDraft) drafts = { ...drafts, [commit.stepId]: "" };
  }
  const last = isLastStep(state.current, steps.length);
  const nextCurrent = last ? state.current : state.current + 1;
  const next: StepperState = {
    current: nextCurrent,
    reached: Math.max(state.reached, nextCurrent),
    answers,
    drafts,
  };
  return last
    ? { state: next, completed: toCompletedAnswers(steps, answers) }
    : { state: next };
}

/** Commit the chosen option for the current question step and advance. */
export function answerWithOption(
  state: StepperState,
  steps: ChatInteractionStep[],
  optionId: string,
): Transition {
  const step = steps[state.current];
  if (step?.kind !== "question") return { state };
  const label = optionLabel(step, optionId);
  if (label === null) return { state };
  return advance(state, steps, {
    stepId: step.id,
    answer: { answer: label, optionId },
    clearDraft: true,
  });
}

/** Commit the current question step's typed draft (if non-empty) and advance. */
export function answerWithText(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  const step = steps[state.current];
  if (step?.kind !== "question") return { state };
  const text = normalizeAnswer(draftFor(state, step.id));
  if (text === null) {
    // No typed text: fall back to an already-selected option, if any.
    const optionId = selectedOptionId(state, step.id);
    if (optionId === null) return { state };
    return advance(state, steps);
  }
  return advance(state, steps, {
    stepId: step.id,
    answer: { answer: text, optionId: null },
    clearDraft: false,
  });
}

/** Advance past the current step WITHOUT completing it — the Skip transition,
 *  offered on EVERY step kind. Mirrors `advance`'s frontier-advancing mechanics
 *  but commits nothing: a skipped question is simply omitted from
 *  `toCompletedAnswers` (its `if (committed)` guard), and a skipped signin or
 *  connect step is the APP's to report (it records the skip so the composed
 *  reply can tell the agent the user declined). When the skipped step is the
 *  last one, completion still fires exactly like every other terminal
 *  transition, with whatever was committed before it. */
export function skipStep(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  return advance(state, steps);
}

/** Advance past a connect step once the app reports it connected. */
export function advanceConnect(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  return advance(state, steps);
}

/** Advance past a signin step once the app reports the user signed in. */
export function advanceSignin(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  return advance(state, steps);
}

/** Advance past a credential step once the app reports the secret was saved. */
export function advanceCredential(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  return advance(state, steps);
}

/** Advance past a custom step once the app's renderer reports it done. Like
 *  every non-question step it contributes no ChatInteractionAnswer; the machine
 *  just moves the cursor and completes if the custom step was the last one. */
export function advanceCustom(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  return advance(state, steps);
}
