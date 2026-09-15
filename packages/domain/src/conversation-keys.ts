import type { Activity, Routine } from "@houston/protocol";

/**
 * THE CHATS HOUSTON ADDRESSES FOR A RECORD, rather than for the person.
 *
 * A mission card and a routine run each talk in a conversation of their own, at
 * an address this product decides. The person never opens one from their chat
 * list and never names one: the card and the routine are where its title comes
 * from and where deleting it belongs, so anything working on conversations by
 * id has to be able to tell these apart from a chat the person started.
 *
 * The spellings live HERE, once. Written out at each site they are a convention
 * nobody can see the whole of — a reader of one `activity-${id}` template
 * cannot tell whether it is the only one, and a guard written from it would
 * quietly stop covering what it was written for.
 */

/** Which record a conversation belongs to, when one does. */
export type RecordConversationKind = "mission" | "routine";

const PREFIXES: Record<RecordConversationKind, string> = {
  mission: "activity-",
  routine: "routine-",
};

/** The conversation a mission with no explicit `session_key` is talked about in. */
export function missionConversationId(missionId: string): string {
  return `${PREFIXES.mission}${missionId}`;
}

/** A mission's chat address: its explicit `session_key`, else the convention. */
export function missionConversationKey(
  activity: Pick<Activity, "id" | "session_key">,
): string {
  return activity.session_key ?? missionConversationId(activity.id);
}

/**
 * Whether `conversationId` addresses this mission: its explicit `session_key`
 * OR the convention id.
 *
 * BOTH, deliberately. A mission that carries an explicit key can still be
 * reached by the convention one — a client that addressed the card before the
 * key was stored, a turn settled from another surface — and a status write that
 * misses its card leaves the board showing work that already finished.
 */
export function addressesMission(
  activity: Pick<Activity, "id" | "session_key">,
  conversationId: string,
): boolean {
  return (
    activity.session_key === conversationId ||
    missionConversationId(activity.id) === conversationId
  );
}

/**
 * The conversation a routine run uses. `shared` (default) → one conversation
 * per routine, so every run continues the same chat; `per_run` → a fresh
 * conversation per run. Matches the RoutineChatMode contract.
 */
export function routineConversationId(routine: Routine, runId: string): string {
  return routine.chat_mode === "per_run"
    ? `${PREFIXES.routine}${routine.id}-${runId}`
    : `${PREFIXES.routine}${routine.id}`;
}

/**
 * Which record owns this conversation, read from the id ALONE — `null` for a
 * chat the person started.
 *
 * The convention is the whole of what an id can say. A mission whose
 * `session_key` was set to something else reads as an ordinary chat here, and
 * is recognized only by a caller holding the board itself
 * ({@link missionConversationKey}); this answers for the callers that hold
 * nothing but an id, where a miss costs a refusal that does not happen rather
 * than a wrong one.
 */
export function recordConversationKind(
  conversationId: string,
): RecordConversationKind | null {
  for (const [kind, prefix] of Object.entries(PREFIXES)) {
    if (conversationId.startsWith(prefix))
      return kind as RecordConversationKind;
  }
  return null;
}
