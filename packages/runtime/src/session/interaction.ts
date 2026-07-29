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
 * Merge semantics within one turn (the tools may call any combination):
 * - `ask_user` SETS the question steps — a second `ask_user` call REPLACES them
 *   (ids `q1`..`qN`).
 * - A `signin_required` (409) from the integrations host RECORDS the single
 *   signin step (id `s1`) — idempotent: a repeat call keeps the one step and
 *   the LAST call's reason wins.
 * - `request_connection` APPENDS a connect step, deduped by normalized toolkit —
 *   a repeat call for the same toolkit updates its reason (ids `c1`..`cN` in
 *   first-seen order).
 * - The recorded {@link PendingInteraction} is the question steps THEN the
 *   signin step THEN the connect steps, so the UI walks the user through
 *   everything the model queued in one flow. Any single kind alone still yields
 *   a valid sequence.
 *
 * Precedence across the step kinds (see {@link InteractionHolder.pending}): a
 * `plan_ready` step OWNS the interaction exclusively; otherwise the sequence is
 * the questions, then the signin step, then the connects; and a
 * `suggest_reusable` and `suggest_actions` are optional clean-finish offers.
 * They may ride the same done frame in the order actions then reusable, but
 * any question/signin/connect/credential/plan_ready blocks and wins instead.
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
type SigninStep = Extract<InteractionStep, { kind: "signin" }>;
type ConnectStep = Extract<InteractionStep, { kind: "connect" }>;
type CredentialStep = Extract<InteractionStep, { kind: "credential" }>;
type PlanReadyStep = Extract<InteractionStep, { kind: "plan_ready" }>;
type SuggestReusableStep = Extract<
  InteractionStep,
  { kind: "suggest_reusable" }
>;
type SuggestActionsStep = Extract<InteractionStep, { kind: "suggest_actions" }>;

export interface InteractionHolder {
  /** Question steps from the last `ask_user` call this turn (replace semantics). */
  readonly questions: QuestionStep[];
  /** The single signin step, once the host reported the user must sign in. */
  readonly signin: SigninStep | undefined;
  /** Connect steps appended by `request_connection`, deduped by toolkit. */
  readonly connects: ConnectStep[];
  /** Credential steps appended by `request_credential` (custom integrations),
   *  deduped by toolkit — the user enters the secret in a secure card. */
  readonly credentials: CredentialStep[];
  /** The single plan-ready step, once the model called `plan_ready` (plan mode
   *  only). When set it OWNS the interaction exclusively — see {@link pending}. */
  readonly planReady: PlanReadyStep | undefined;
  /** The single optional save offer (id `r1`) for a cleanly completed mission.
   *  It can coexist with {@link suggestActions}; blocking steps take priority.
   *  See {@link pending}. */
  readonly suggestReusable: SuggestReusableStep | undefined;
  /** Optional concrete next-step bubbles for a cleanly completed mission. */
  readonly suggestActions: SuggestActionsStep | undefined;
  /** The recorded sequence — question steps, then the signin step, then connect
   *  steps — or undefined when the model asked for nothing this turn. Derived:
   *  read after prompt(). */
  readonly pending: PendingInteraction | undefined;
}

class Holder implements InteractionHolder {
  readonly questions: QuestionStep[] = [];
  signin: SigninStep | undefined;
  readonly connects: ConnectStep[] = [];
  readonly credentials: CredentialStep[] = [];
  planReady: PlanReadyStep | undefined;
  suggestReusable: SuggestReusableStep | undefined;
  suggestActions: SuggestActionsStep | undefined;

  get pending(): PendingInteraction | undefined {
    // A plan-ready step is exclusive: the plan-mode overlay tells the model to
    // call `plan_ready` ALONE (and the tool subset withholds the ways to act),
    // so if it somehow also queued questions/signin/connects this turn, the plan
    // card still wins. Defensive normalization — one card, one meaning.
    if (this.planReady) return { steps: [this.planReady] };
    const steps = [
      ...this.questions,
      ...(this.signin ? [this.signin] : []),
      ...this.connects,
      // Credentials sit with connects (entering a key is a form of connecting).
      ...this.credentials,
    ];
    if (steps.length > 0) return { steps };
    // Optional offers may compose on the clean frame. Actions render first,
    // then the reusable reflection card, so both stay visible without blocking.
    const suggestions = [
      ...(this.suggestActions ? [this.suggestActions] : []),
      ...(this.suggestReusable ? [this.suggestReusable] : []),
    ];
    if (suggestions.length) return { steps: suggestions };
    return undefined;
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
 * Record the single signin step for this turn (the host reported the user must
 * sign in to Houston before integrations can act). Idempotent: there is at most
 * one signin step (id `s1`), so a repeat call keeps that one step and the LAST
 * call's reason wins. A no-op outside a turn.
 */
export function recordSignin(input: { reason?: string }): void {
  const holder = store.getStore();
  if (!holder) return;
  const reason = input.reason?.trim();
  (holder as Holder).signin = {
    kind: "signin",
    id: "s1",
    ...(reason ? { reason } : {}),
  };
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

/**
 * Append a credential step for this turn (the model called `request_credential`
 * for a custom integration), deduped by toolkit exactly like connects: a first
 * mention gets the next `k1`..`kN` id; a repeat for the same toolkit updates
 * its reason in place. A no-op outside a turn.
 */
export function recordCredentialRequest(input: {
  toolkit: string;
  reason?: string;
}): void {
  const holder = store.getStore();
  if (!holder) return;
  const existing = holder.credentials.find((c) => c.toolkit === input.toolkit);
  if (existing) {
    if (input.reason) existing.reason = input.reason;
    return;
  }
  holder.credentials.push({
    kind: "credential",
    id: `k${holder.credentials.length + 1}`,
    toolkit: input.toolkit,
    ...(input.reason ? { reason: input.reason } : {}),
  });
}

/**
 * Record the single plan-ready step for this turn (the model called `plan_ready`
 * in Plan mode to present its finished plan). There is at most one such step
 * (id `p1`); it OWNS the interaction exclusively (see {@link InteractionHolder.pending}).
 * The summary is trimmed. A no-op outside a turn.
 */
export function recordPlanReady(input: { summary: string }): void {
  const holder = store.getStore();
  if (!holder) return;
  (holder as Holder).planReady = {
    kind: "plan_ready",
    id: "p1",
    summary: input.summary.trim(),
  };
}

/** The deterministic plan-mode completion offer when the model wrote a plan
 * without calling `plan_ready`. Kept beside `recordPlanReady` so both shapes
 * remain deliberately identical. */
export function planReadyFallback(): PendingInteraction {
  return { steps: [{ kind: "plan_ready", id: "p1", summary: "" }] };
}

/**
 * Record the single suggest-reusable step for this turn (the model called
 * `suggest_reusable` on a clean finish to offer saving the work as a Skill,
 * Routine, or Learning). There is at most one such step (id `r1`); it is FALLBACK-ONLY —
 * surfaced only when nothing else was queued this turn (see
 * {@link InteractionHolder.pending}). The title and rationale are trimmed. A
 * no-op outside a turn.
 */
export function recordSuggestReusable(input: {
  reusableKind: "skill" | "routine" | "learning";
  title: string;
  rationale: string;
}): void {
  const holder = store.getStore();
  if (!holder) return;
  (holder as Holder).suggestReusable = {
    kind: "suggest_reusable",
    id: "r1",
    reusableKind: input.reusableKind,
    title: input.title.trim(),
    rationale: input.rationale.trim(),
  };
}

/** Record concrete follow-up bubbles for a completed mission. */
export function recordSuggestActions(input: {
  actions: { id: string; label: string; message: string }[];
}): void {
  const holder = store.getStore();
  if (!holder) return;
  (holder as Holder).suggestActions = {
    kind: "suggest_actions",
    id: "a1",
    actions: input.actions.map((action) => ({
      id: action.id.trim(),
      label: action.label.trim(),
      message: action.message.trim(),
    })),
  };
}
