import { allCachedActivityRows } from "./cached-conversation-rows";
import {
  captureAgentDraftKeys,
  forgetConversationDrafts,
} from "./conversation-drafts";
import { queryClient } from "./query-client";
import type { Agent } from "./types";

export function prepareAgentDraftForget(
  agentId: string,
  agents: readonly Agent[],
): () => void {
  const keys = captureAgentDraftKeys(agentId, agents, (agentPath) =>
    allCachedActivityRows(queryClient, agentPath),
  );
  return () => {
    for (const key of keys) forgetConversationDrafts(key);
  };
}
