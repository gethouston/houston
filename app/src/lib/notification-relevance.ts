import {
  isRelevantToMe,
  type RelevanceConversation,
} from "./mission-relevance.ts";

export interface SessionConversationRow extends RelevanceConversation {
  agent_path: string;
  session_key: string;
}

export function findSessionConversation(
  rows: readonly SessionConversationRow[] | undefined,
  agentPath: string,
  sessionKey: string,
): SessionConversationRow | undefined {
  return rows?.find(
    (row) => row.agent_path === agentPath && row.session_key === sessionKey,
  );
}

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
