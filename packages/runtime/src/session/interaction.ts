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
 * - An integration `execute` gated by the host (409 "approval_required") RECORDS
 *   an approval step, deduped by `paramsHash` — a repeat record for the same
 *   hash is a no-op (ids `a1`..`aN` in first-seen order).
 * - The recorded {@link PendingInteraction} is the question steps THEN the
 *   signin step THEN the connect steps THEN the approval steps, so the UI walks
 *   the user through everything the model queued in one flow. Any single kind
 *   alone still yields a valid sequence.
 *
 * Precedence across the step kinds (see {@link InteractionHolder.pending}): a
 * `plan_ready` step OWNS the interaction exclusively; otherwise the sequence is
 * the questions, then the signin step, then the connects, then the approvals
 * (approvals LAST — approving an action happens after connecting its toolkit);
 * and a `suggest_reusable` step is FALLBACK-ONLY — it surfaces solely when there
 * are no other steps at all this turn, because it means the mission genuinely IS
 * done (any question/signin/connect/approval/plan_ready means it is not).
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
type ApprovalStep = Extract<InteractionStep, { kind: "approval" }>;

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
  /** The single suggest-reusable step (id `r1`), once the model called
   *  `suggest_reusable` on a clean finish to offer saving the work as a Skill,
   *  Routine, or Learning. CRITICALLY DIFFERENT FROM {@link planReady}: it does NOT own the
   *  interaction exclusively. It is a FALLBACK ONLY — used solely when there are
   *  no other steps at all this turn. Questions/signin/connects/planReady all
   *  take priority, because any of those means the mission genuinely is not done
   *  yet, whereas a suggestion means it IS done. See {@link pending}. */
  readonly suggestReusable: SuggestReusableStep | undefined;
  /** Approval steps recorded when the host gated an integration `execute`
   *  (409 "approval_required"), deduped by paramsHash. */
  readonly approvals: ApprovalStep[];
  /** The recorded sequence — question steps, then the signin step, then connect
   *  steps, then approval steps — or undefined when the model asked for nothing
   *  this turn. Derived: read after prompt(). */
  readonly pending: PendingInteraction | undefined;
}

class Holder implements InteractionHolder {
  readonly questions: QuestionStep[] = [];
  signin: SigninStep | undefined;
  readonly connects: ConnectStep[] = [];
  readonly credentials: CredentialStep[] = [];
  planReady: PlanReadyStep | undefined;
  suggestReusable: SuggestReusableStep | undefined;
  readonly approvals: ApprovalStep[] = [];

  get pending(): PendingInteraction | undefined {
    // A plan-ready step is exclusive: the plan-mode overlay tells the model to
    // call `plan_ready` ALONE (and the tool subset withholds the ways to act),
    // so if it somehow also queued questions/signin/connects/approvals this
    // turn, the plan card still wins. Defensive normalization — one card, one
    // meaning.
    if (this.planReady) return { steps: [this.planReady] };
    const steps = [
      ...this.questions,
      ...(this.signin ? [this.signin] : []),
      ...this.connects,
      // Credentials sit with connects (entering a key is a form of connecting);
      // approvals LAST, since approving an action happens after its toolkit is
      // connected and credentialed.
      ...this.credentials,
      ...this.approvals,
    ];
    if (steps.length > 0) return { steps };
    // suggest_reusable is FALLBACK-ONLY: it surfaces solely when nothing else
    // was queued this turn. Any question/signin/connect/approval above means the
    // mission is not done, so it wins and the suggestion is dropped entirely — a
    // suggestion must NEVER flip the board to `needs_you`.
    if (this.suggestReusable) return { steps: [this.suggestReusable] };
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

/**
 * Append an approval step for this turn (the host gated an integration `execute`
 * with a 409 "approval_required"), deduped by `paramsHash`: a first request for
 * a hash gets the next `a1`..`aN` id; a repeat for the same hash is a no-op
 * (same action + params → one card). A no-op outside a turn.
 */
export function recordApproval(input: {
  toolkit: string;
  action: string;
  intent?: string;
  params?: Record<string, string>;
  paramsOmitted?: number;
  paramsHash: string;
}): void {
  const holder = store.getStore();
  if (!holder) return;
  if (holder.approvals.some((a) => a.paramsHash === input.paramsHash)) return;
  holder.approvals.push({
    kind: "approval",
    id: `a${holder.approvals.length + 1}`,
    toolkit: input.toolkit,
    action: input.action,
    ...(input.intent ? { intent: input.intent } : {}),
    ...(input.params ? { params: input.params } : {}),
    ...(input.paramsOmitted !== undefined
      ? { paramsOmitted: input.paramsOmitted }
      : {}),
    paramsHash: input.paramsHash,
  });
}
