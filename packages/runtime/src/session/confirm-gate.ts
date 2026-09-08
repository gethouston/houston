import { createHash } from "node:crypto";

/**
 * Where a destructive Houston operation's approval actually lives.
 *
 * The rule: THE MODEL CANNOT MINT APPROVAL. An approval exists only as a record
 * written here, and the only thing that writes one is
 * {@link resolveConfirmationReply} — fed the user's own next message, which the
 * model has no way to author (it arrives on the conversation's `messages`
 * route, from the app, after the person clicked an option on the card the
 * runtime raised).
 *
 * The record is deliberately narrow, because every widening is a way to delete
 * the wrong thing:
 * - KEYED by a sha256 of the operation name plus its CANONICALIZED arguments,
 *   so approving "delete Personal/Dobby" approves nothing else — a different id,
 *   a different operation, an extra argument all hash differently.
 * - SINGLE USE: {@link takeConfirmationOutcome} removes the record it returns,
 *   so one approval performs one action. A second identical call asks again.
 * - SHORT LIVED ({@link CONFIRMATION_TTL_MS}): an approval the user gave and the
 *   model sat on is not an approval any more.
 * - SCOPED to one conversation: approving in one chat authorizes nothing in
 *   another, and an unattended turn (a routine) can never inherit one.
 *
 * A decline is recorded the same way, for the same span, and is consumed the
 * same way — so a retry reads "the user said no" once, and then has to ask
 * again rather than looping on a stale refusal.
 *
 * Fail-closed everywhere: no conversation, no record, an expired record, a
 * reply that answered something else — all of them mean "not approved".
 */

/** How long an approval (or a decline) stays usable. */
export const CONFIRMATION_TTL_MS = 10 * 60_000;

/** What the runtime asked the user, and the two answers that decide it. */
export interface ConfirmationRequest {
  conversationId: string;
  /** {@link confirmationKey} of the exact call this approves. */
  key: string;
  /** The card's question text, verbatim — half of the reply line to match. */
  question: string;
  approveLabel: string;
  declineLabel: string;
}

type Outcome = "granted" | "declined";

interface Record_ {
  key: string;
  outcome: Outcome;
  expiresAt: number;
}

interface ConversationState {
  /** Confirmations raised on the turn that just ended, awaiting the user's reply. */
  pending: (ConfirmationRequest & { expiresAt: number })[];
  /** Decided confirmations, each usable exactly once. */
  decided: Record_[];
}

const byConversation = new Map<string, ConversationState>();

function stateFor(conversationId: string): ConversationState {
  const existing = byConversation.get(conversationId);
  if (existing) return existing;
  const fresh: ConversationState = { pending: [], decided: [] };
  byConversation.set(conversationId, fresh);
  return fresh;
}

/** Drop everything past its expiry, and any conversation left with nothing —
 *  the store is unbounded otherwise, and an expired record is already useless. */
function prune(): void {
  const now = Date.now();
  for (const [id, state] of byConversation) {
    state.pending = state.pending.filter((p) => p.expiresAt > now);
    state.decided = state.decided.filter((d) => d.expiresAt > now);
    if (state.pending.length === 0 && state.decided.length === 0)
      byConversation.delete(id);
  }
}

/**
 * A stable fingerprint of ONE exact call. Object keys are sorted and
 * `undefined` values dropped so two spellings of the same arguments agree,
 * while array order is preserved because it is meaningful. Anything that
 * changes what the operation would DO changes the hash, which is what makes an
 * approval un-reusable for a different target.
 */
export function confirmationKey(
  operation: string,
  params: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(`${operation}\n${canonicalize(params)}`)
    .digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(",")}}`;
}

/** Note that the user is being shown this card, so their answer can decide it. */
export function recordConfirmationRequest(request: ConfirmationRequest): void {
  prune();
  const state = stateFor(request.conversationId);
  // One card per exact call: a model that calls the same thing twice in a turn
  // must not queue two questions that a single answer would both decide.
  state.pending = state.pending.filter((p) => p.key !== request.key);
  state.pending.push({
    ...request,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  });
}

/**
 * Read the user's next message in a conversation and decide every confirmation
 * it answers. Called once per turn, before the model runs.
 *
 * The match is EXACT, against strings the runtime itself authored: the app
 * composes an answered question as `"<question>: <answer>"`, and the answer is
 * the option's label verbatim, so the approve line is a string only the person
 * who clicked that option can produce. Anything else — free text, a different
 * option, a new request — decides nothing.
 *
 * Every pending confirmation is cleared either way: the card is gone once the
 * user has replied, so a later message must never be able to answer it.
 */
export function resolveConfirmationReply(
  conversationId: string,
  userText: string,
): void {
  prune();
  const state = byConversation.get(conversationId);
  if (!state || state.pending.length === 0) return;
  const lines = new Set(userText.split("\n").map((line) => line.trim()));
  const expiresAt = Date.now() + CONFIRMATION_TTL_MS;
  for (const pending of state.pending) {
    const outcome = lines.has(`${pending.question}: ${pending.approveLabel}`)
      ? "granted"
      : lines.has(`${pending.question}: ${pending.declineLabel}`)
        ? "declined"
        : undefined;
    if (outcome) state.decided.push({ key: pending.key, outcome, expiresAt });
  }
  state.pending = [];
}

/**
 * Consume the decision for one exact call: `"granted"` (go ahead, once),
 * `"declined"` (the user said no), or `"none"` (nobody has decided this).
 * Consuming is the point — the record is removed, so nothing is ever approved
 * twice by one answer.
 */
export function takeConfirmationOutcome(
  conversationId: string | undefined,
  key: string,
): Outcome | "none" {
  if (!conversationId) return "none";
  prune();
  const state = byConversation.get(conversationId);
  if (!state) return "none";
  const index = state.decided.findIndex((d) => d.key === key);
  if (index === -1) return "none";
  const [taken] = state.decided.splice(index, 1);
  return taken.outcome;
}

/** Forget a conversation's confirmations (it was deleted), or all of them. */
export function clearConfirmations(conversationId?: string): void {
  conversationId
    ? byConversation.delete(conversationId)
    : byConversation.clear();
}
