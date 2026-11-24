import {
  type ChatInteractionAnswer,
  type ChatInteractionStep,
  normalizeAnswer,
  optionLabel,
} from "./interaction-card-model.ts";
import { type FileClaims, releaseClaim } from "./interaction-file-claim.ts";

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

export interface StepAnswer {
  answer: string;
  optionId: string | null;
}

export type AnswerMap = Record<string, StepAnswer>;

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
  /** Which steps the attached files answer (`interaction-file-claim`). */
  fileClaims?: FileClaims;
}

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

export function defaultProgress(current: number, total: number): string {
  return `${current} of ${total}`;
}

export function selectedOptionId(
  state: StepperState,
  stepId: string,
): string | null {
  return state.answers[stepId]?.optionId ?? null;
}

export function draftFor(state: StepperState, stepId: string): string {
  return state.drafts[stepId] ?? "";
}

export function canAdvanceQuestion(
  optionSelected: boolean,
  draft: string,
): boolean {
  return optionSelected || normalizeAnswer(draft) !== null;
}

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
        ...(committed.optionId === null
          ? ({ source: "text" } as const)
          : ({ source: "option", optionId: committed.optionId } as const)),
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

export function canGoForward(state: StepperState): boolean {
  return state.current < state.reached;
}

export function goForward(state: StepperState): StepperState {
  return { ...state, current: Math.min(state.reached, state.current + 1) };
}

function advance(
  from: StepperState,
  steps: ChatInteractionStep[],
  commit?: { stepId: string; answer: StepAnswer; clearDraft: boolean },
): Transition {
  const state = commit
    ? releaseClaim(from, commit.stepId, commit.answer)
    : from;
  let answers = state.answers;
  let drafts = state.drafts;
  if (commit) {
    answers = { ...answers, [commit.stepId]: commit.answer };
    if (commit.clearDraft) drafts = { ...drafts, [commit.stepId]: "" };
  }
  const last = isLastStep(state.current, steps.length);
  const nextCurrent = last ? state.current : state.current + 1;
  const next: StepperState = {
    ...state,
    current: nextCurrent,
    reached: Math.max(state.reached, nextCurrent),
    answers,
    drafts,
  };
  return last
    ? { state: next, completed: toCompletedAnswers(steps, answers) }
    : { state: next };
}

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

export function answerWithText(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  const step = steps[state.current];
  if (step?.kind !== "question") return { state };
  const text = normalizeAnswer(draftFor(state, step.id));
  if (text === null) {
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

export function skipStep(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  const stepId = steps[state.current]?.id;
  if (stepId === undefined) return advance(state, steps);
  const released = releaseClaim(state, stepId);
  if (!(stepId in released.answers)) return advance(released, steps);
  const answers = { ...released.answers };
  delete answers[stepId];
  return advance({ ...released, answers }, steps);
}

export function advanceConnect(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  return advance(state, steps);
}

export function advanceSignin(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  return advance(state, steps);
}

export function advanceCredential(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  return advance(state, steps);
}

export function advanceCustom(
  state: StepperState,
  steps: ChatInteractionStep[],
): Transition {
  return advance(state, steps);
}
