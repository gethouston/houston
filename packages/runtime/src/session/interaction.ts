import { AsyncLocalStorage } from "node:async_hooks";
import type {
  InteractionStep,
  PendingInteraction,
} from "@houston/runtime-client";

/**
 * The interaction sequence THIS turn ended up waiting on the user for: recorded
 * when the model calls `ask_user` / `request_connection`, read after the turn's
 * `prompt()` resolves, and attached to the terminal clean `done` frame so the
 * board card can settle to `needs_you`.
 *
 * Merge semantics within one turn (the tools may call both):
 * - `ask_user` SETS the question steps — a second `ask_user` call REPLACES them
 *   (ids `q1`..`qN`).
 * - `request_connection` APPENDS a connect step, deduped by normalized toolkit —
 *   a repeat call for the same toolkit updates its reason (ids `c1`..`cN` in
 *   first-seen order).
 * - The recorded {@link PendingInteraction} is the question steps THEN the
 *   connect steps, so the UI walks the user through everything the model queued
 *   in one flow. Either tool alone still yields a valid sequence.
 *
 * Turn-scoping mechanism (mirrors acting-context.ts): an `AsyncLocalStorage`
 * whose store — a fresh mutable holder — is established for the DURATION of
 * `session.prompt()`. The tool `execute` callbacks run inside that same async
 * subtree, so the record calls write into THIS turn's holder with no
 * process-global mutation. A brand-new holder every turn IS the reset: nothing
 * from a prior turn can leak, and two conversations running concurrently in one
 * runtime never cross-contaminate. Outside a turn (e.g. a unit test calling a
 * tool directly) the store is undefined, so recording is a silent no-op.
 */

type QuestionStep = Extract<InteractionStep, { kind: "question" }>;
type ConnectStep = Extract<InteractionStep, { kind: "connect" }>;

export interface InteractionHolder {
  /** Question steps from the last `ask_user` call this turn (replace semantics). */
  readonly questions: QuestionStep[];
  /** Connect steps appended by `request_connection`, deduped by toolkit. */
  readonly connects: ConnectStep[];
  /** The recorded sequence — question steps then connect steps — or undefined
   *  when the model asked for nothing this turn. Derived: read after prompt(). */
  readonly pending: PendingInteraction | undefined;
}

class Holder implements InteractionHolder {
  readonly questions: QuestionStep[] = [];
  readonly connects: ConnectStep[] = [];

  get pending(): PendingInteraction | undefined {
    const steps = [...this.questions, ...this.connects];
    return steps.length > 0 ? { steps } : undefined;
  }
}

const store = new AsyncLocalStorage<Holder>();

/** A fresh, empty holder for a new turn. */
export function newInteractionHolder(): InteractionHolder {
  return new Holder();
}

/** Run `fn` with `holder` as the ambient interaction holder for its async subtree. */
export function runWithInteractionCapture<T>(
  holder: InteractionHolder,
  fn: () => T,
): T {
  return store.run(holder as Holder, fn);
}

/**
 * Set the question steps for this turn (REPLACE — a model that asks twice
 * settles on its final batch). A no-op outside a turn.
 */
export function recordQuestions(questions: QuestionStep[]): void {
  const holder = store.getStore();
  if (!holder) return;
  holder.questions.length = 0;
  holder.questions.push(...questions);
}

/**
 * Append a connect step for this turn, deduped by toolkit: a first mention gets
 * the next `c1`..`cN` id; a repeat for the same toolkit updates its reason in
 * place (keeping its id and position). A no-op outside a turn.
 */
export function recordConnection(input: {
  toolkit: string;
  reason?: string;
}): void {
  const holder = store.getStore();
  if (!holder) return;
  const existing = holder.connects.find((c) => c.toolkit === input.toolkit);
  if (existing) {
    if (input.reason) existing.reason = input.reason;
    return;
  }
  holder.connects.push({
    kind: "connect",
    id: `c${holder.connects.length + 1}`,
    toolkit: input.toolkit,
    ...(input.reason ? { reason: input.reason } : {}),
  });
}
