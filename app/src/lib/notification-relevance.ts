import {
  isRelevantToMe,
  type RelevanceConversation,
} from "./mission-relevance.ts";

/**
 * Pure, DOM-free decision behind the completion OS notification (HOU-945): the
 * session that just finished belongs to a mission, and only missions that
 * concern me are worth interrupting me for.
 *
 * It lives outside `hooks/session-notifications.ts` on purpose. That module is
 * all side effect — Tauri windows, the notification plugin, OS permission — and
 * is therefore untestable; the RULE it applies is the part that must never
 * regress, so the rule is here, pure, and the hook keeps only the plumbing.
 *
 * Everything about this module fails OPEN. In a team, a missed ping is a
 * teammate waiting on a mission nobody knows finished; an extra ping is a
 * moment of noise. So an unresolvable session, an unattributed mission, and a
 * signed-out user all notify. See {@link isRelevantToMe}.
 */

/** The conversation-list row shape this module matches sessions against. */
export interface SessionConversationRow extends RelevanceConversation {
  agent_path: string;
  session_key: string;
}

/**
 * Find the mission a completed session belongs to. Session keys are unique
 * within an agent but NOT across agents (`activity-<n>` restarts per agent), so
 * the agent path is part of the match, never an optimization.
 *
 * `undefined` when the roster cache has no row for it — a real and expected
 * state, since the completion event can land before the conversation list that
 * would describe it. Callers must treat that as "unknown", not as "not mine".
 */
export function findSessionConversation(
  rows: readonly SessionConversationRow[] | undefined,
  agentPath: string,
  sessionKey: string,
): SessionConversationRow | undefined {
  return rows?.find(
    (row) => row.agent_path === agentPath && row.session_key === sessionKey,
  );
}

/**
 * Should a completed session's OS notification fire? Relevance-scoped
 * (HOU-945): only my missions, missions I contributed to, missions that
 * @mention me — and everything, byte-identically, when there is no signed-in
 * user or the mission carries no attribution at all.
 */
export function shouldNotifyCompletion(args: {
  rows: readonly SessionConversationRow[] | undefined;
  agentPath: string;
  sessionKey: string;
  selfId: string | null;
}): boolean {
  const conv = findSessionConversation(
    args.rows,
    args.agentPath,
    args.sessionKey,
  );
  return isRelevantToMe(conv, args.selfId);
}
