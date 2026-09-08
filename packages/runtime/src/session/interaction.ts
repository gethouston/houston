/**
 * The interaction sequence THIS turn ended up waiting on the user for: recorded
 * when the model calls `ask_user` / `request_connection`, read after the turn's
 * `prompt()` resolves, and attached to the terminal clean `done` frame so the
 * board card can settle to `needs_you`.
 *
 * Merge semantics within one turn (the tools may call any combination):
 * - The confirmation gate APPENDS an approval card per destructive Houston
 *   operation the model tried to perform (ids `x1`..`xN`), deduped by the
 *   host-issued approval `requestId`.
 *   They LEAD the sequence and no tool can replace them.
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
 *
 * The holder itself, its `pending` precedence, and the turn's finish marks
 * (turn-finish.ts) live in interaction-holder.ts;
 * the recording entry points are grouped by what they queue: questions and
 * approval cards (interaction-questions.ts), the integration access steps
 * (interaction-access.ts), and the completion offers (interaction-offers.ts).
 */

export {
  recordConnection,
  recordCredentialRequest,
  recordSignin,
} from "./interaction-access";
export {
  currentTurnFinish,
  type InteractionHolder,
  newInteractionHolder,
  runWithInteractionCapture,
} from "./interaction-holder";
export {
  planReadyFallback,
  recordPlanReady,
  recordSuggestActions,
  recordSuggestReusable,
} from "./interaction-offers";
export { recordConfirmation, recordQuestions } from "./interaction-questions";
