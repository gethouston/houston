import { rowSessionKey } from "../components/board/session-loading";
import { useDraftStore } from "../stores/drafts";
import { useInteractionDraftStore } from "../stores/interaction-drafts";

/**
 * Forget everything a conversation left unsent: the composer's text and files
 * AND the half-walked interaction card parked beside them. The two live in
 * separate stores (the board subscribes to the composer map, and a card
 * keystroke must not repaint it), so every seam that retires a conversation
 * (agent delete, mission delete) forgets both through this one call.
 */
export function forgetConversationDrafts(sessionKey: string): void {
  useDraftStore.getState().clearDraft(sessionKey);
  useInteractionDraftStore.getState().clear(sessionKey);
}

/** A deleted mission as the delete seams read it out of the query cache. */
export interface ConversationRow {
  id: string;
  session_key?: string;
}

/**
 * Every session key ONE mission's unsent work can be parked under.
 *
 * A mission's chat is keyed by its conversation ({@link rowSessionKey}), so
 * forgetting only the `activity-<id>` stand-in leaves every mission that
 * carries a `session_key` holding its composer text and its half-walked card
 * forever. The stand-in stays in the list regardless: it is what the mission
 * was keyed by before the host stamped a conversation onto it, and clearing a
 * key nothing parked under is a no-op.
 */
export function conversationDraftKeysOf(row: ConversationRow): string[] {
  const own = rowSessionKey(row);
  const fallback = `activity-${row.id}`;
  return own === fallback ? [own] : [own, fallback];
}

/**
 * The same, for a whole deletion: the ids being deleted resolved against the
 * rows the board still holds. An id no cached row names keeps the stand-in —
 * the best a seam can do without a row, and exactly what it forgot before.
 */
export function conversationDraftKeysFor(
  ids: readonly string[],
  rows: readonly ConversationRow[],
): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => conversationDraftKeysOf(byId.get(id) ?? { id }));
}

/** Retire the unsent work of every deleted mission, under each key it could
 *  have been parked under. Call BEFORE the rows leave the cache. */
export function forgetDeletedConversationDrafts(
  ids: readonly string[],
  rows: readonly ConversationRow[],
): void {
  for (const key of conversationDraftKeysFor(ids, rows)) {
    forgetConversationDrafts(key);
  }
}

/** Retire ONE deleted mission's unsent work, under each key it could have been
 *  parked under. */
export function forgetConversationDraftsOf(row: ConversationRow): void {
  for (const key of conversationDraftKeysOf(row)) {
    forgetConversationDrafts(key);
  }
}

/**
 * Every key a DELETED AGENT's unsent work can be parked under: its free-form
 * chat, plus every mission it owned.
 *
 * The missions have no store of their own to be swept from, so an agent delete
 * that forgets only `chat-<id>` leaves each mission's composer text and
 * half-walked card parked for the life of the session.
 *
 * Deduped: the rows are a union of two caches that overlap on the missions both
 * have swept.
 */
export function agentConversationDraftKeys(
  agentId: string,
  rows: readonly ConversationRow[],
): string[] {
  return [
    ...new Set([`chat-${agentId}`, ...rows.flatMap(conversationDraftKeysOf)]),
  ];
}

/** An agent as a draft capture reads it: who it is, and where its board rows
 *  are cached. */
export interface DraftAgentRef {
  id: string;
  folderPath: string;
}

/**
 * The keys of everything one agent has left unsent, resolved AGAINST A ROSTER
 * SNAPSHOT — the whole point of the capture.
 *
 * The delete seam cannot resolve them afterwards: the host emits
 * `AgentsChanged` before the delete call answers, so the roster reload can drop
 * the agent (and with it the board path its missions are cached under) while
 * the caller is still awaiting. Reading the roster and the rows up front, and
 * forgetting the resulting keys once the delete succeeds, is what keeps the two
 * honest: a delete that fails forgets nothing.
 *
 * An agent the snapshot does not name leaves the mission rows unreachable; the
 * free-form chat is then all there is to retire.
 */
export function captureAgentDraftKeys(
  agentId: string,
  agents: readonly DraftAgentRef[],
  rowsOf: (agentPath: string) => readonly ConversationRow[],
): string[] {
  const agentPath = agents.find((a) => a.id === agentId)?.folderPath;
  return agentConversationDraftKeys(
    agentId,
    agentPath === undefined ? [] : rowsOf(agentPath),
  );
}
