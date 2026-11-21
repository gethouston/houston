import { rowSessionKey } from "../components/board/session-loading";
import { useDraftStore } from "../stores/drafts";
import { useInteractionDraftStore } from "../stores/interaction-drafts";

export function forgetConversationDrafts(sessionKey: string): void {
  useDraftStore.getState().clearDraft(sessionKey);
  useInteractionDraftStore.getState().clear(sessionKey);
}

export interface ConversationRow {
  id: string;
  session_key?: string;
}

export function conversationDraftKeysOf(row: ConversationRow): string[] {
  const own = rowSessionKey(row);
  const fallback = `activity-${row.id}`;
  return own === fallback ? [own] : [own, fallback];
}

export function conversationDraftKeysFor(
  ids: readonly string[],
  rows: readonly ConversationRow[],
): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => conversationDraftKeysOf(byId.get(id) ?? { id }));
}

export function forgetDeletedConversationDrafts(
  ids: readonly string[],
  rows: readonly ConversationRow[],
): void {
  for (const key of conversationDraftKeysFor(ids, rows)) {
    forgetConversationDrafts(key);
  }
}

export function forgetConversationDraftsOf(row: ConversationRow): void {
  for (const key of conversationDraftKeysOf(row)) {
    forgetConversationDrafts(key);
  }
}

export function agentConversationDraftKeys(
  agentId: string,
  rows: readonly ConversationRow[],
): string[] {
  return [
    ...new Set([`chat-${agentId}`, ...rows.flatMap(conversationDraftKeysOf)]),
  ];
}

export interface DraftAgentRef {
  id: string;
  folderPath: string;
}

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
