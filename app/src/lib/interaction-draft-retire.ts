import type { SessionStatusValue } from "@houston/sdk";
import { useInteractionDraftStore } from "../stores/interaction-drafts";

/** The four session statuses the SDK emits; the wire hands the app a bare
 *  string, so a status is narrowed at that boundary and nowhere else. */
const SESSION_STATUSES: readonly string[] = [
  "starting",
  "running",
  "completed",
  "error",
] satisfies SessionStatusValue[];

/**
 * The feed types a turn PRODUCES: every push the SDK turn machinery makes while
 * a turn is live on the conversation — `turn-frames.ts` live wire frames,
 * `turn-sink.ts` running-sync replay, and the streamed text/reasoning flushes
 * `turn-settle.ts` makes at the end of a turn that streamed.
 *
 * Three pushes are left out, each with a producer that runs with no turn behind
 * it: `final_result` (the invisible settle that stops the progress line),
 * `system_message` (the send-rejected / reload-failed / board-persist-failed
 * lines) and `user_message` — the client's own echo, which
 * `pushPendingUserMessage` emits UNFLAGGED for a message still held
 * client-side while a new agent's engine warms up. A reloaded transcript
 * pushes none of these: the history fold seeds the VM directly, never the
 * feed bus.
 */
export const TURN_EVIDENCE_FEED_TYPES = [
  "assistant_text_streaming",
  "thinking_streaming",
  "assistant_text",
  "thinking",
  "tool_call",
  "tool_result",
  "provider_switched",
  "context_compacted",
  "context_cleared",
  "file_changes",
  "provider_error",
] as const;

/** The same allowlist as a membership test over the wire's bare string. */
const TURN_EVIDENCE: ReadonlySet<string> = new Set(TURN_EVIDENCE_FEED_TYPES);

/** A feed push as the retirement rule reads it: WHOSE evidence it is, which the
 *  two optimism flags answer for every kind of item alike. */
interface FeedPush {
  feed_type: string;
  /** The optimistic user bubble, pushed before the engine has confirmed
   *  anything. */
  pending?: boolean;
  /** A client-generated send failure: the message never reached the engine. */
  fails_pending?: boolean;
}

/** The wire boundary: narrows a `SessionStatus` event's bare string. */
export function isSessionStatusValue(
  status: string,
): status is SessionStatusValue {
  return SESSION_STATUSES.includes(status);
}

/**
 * Retire the half-walked card parked against `sessionKey` once a turn is PROVEN
 * to have taken that conversation, wherever the turn was started from.
 *
 * Proof is a frame a turn PRODUCED ({@link TURN_EVIDENCE_FEED_TYPES}), never the
 * optimistic `running` status: `streamTurn` emits that before it even calls the
 * engine, so a send the server refuses (403, offline) would otherwise throw the
 * user's answers away. The optimism flags alone are not enough either: a
 * provider-auth refusal pushes its typed card `fails_pending` and then an
 * UNFLAGGED invisible `final_result` (`settleProviderErrorCard`), so a rule that
 * read any unflagged push as evidence would retire on a turn that never ran.
 *
 * An UNFLAGGED `provider_error` is evidence all the same, and the flag check
 * above is what makes it safe: `settleProviderErrorCard` omits `fails_pending`
 * only when the turn was delivered — frames arrived, or the engine took the
 * send — so the unflagged card is by construction a mid-turn failure of a turn
 * that ran, while the client-built not-connected card always carries the flag.
 *
 * What this still does not cover: a delivered turn that produced NO frame at
 * all and settled `error` — a user Stop before the first token. Its card stays
 * parked until the next real turn on that conversation retires it, which always
 * precedes a new card mounting (a card only ever arrives ON a turn's frames).
 *
 * Reopening a conversation proves nothing and retires nothing: a history load
 * seeds the VM directly (`seedConversationVm` → `conversationVm.seedHistory`)
 * and an observer attaching to an idle conversation only calls `confirmIdle`,
 * so neither pushes a feed item onto the bus.
 *
 * Bound to the SESSION rather than to the open mission: a turn can start in a
 * conversation the user is not looking at (a routine, another of their missions,
 * a teammate), and a byte-identical re-ask would otherwise restore last run's
 * answers.
 */
export function retireParkedInteractionOnFeedItem(
  sessionKey: string,
  item: FeedPush,
): void {
  if (item.pending === true || item.fails_pending === true) return;
  if (!TURN_EVIDENCE.has(item.feed_type)) return;
  useInteractionDraftStore.getState().clear(sessionKey);
}

/**
 * The second proof: a settle. `completed` only ever follows a turn the engine
 * actually ran, so it retires the card even when every frame of that turn
 * arrived before this client was listening. `error` does not — a refused send
 * settles that way with no turn behind it.
 */
export function retireParkedInteractionOnSessionStatus(
  status: SessionStatusValue,
  sessionKey: string,
): void {
  if (status !== "completed") return;
  useInteractionDraftStore.getState().clear(sessionKey);
}
