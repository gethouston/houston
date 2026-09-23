import { allCachedActivityRows } from "./cached-conversation-rows";
import {
  captureAgentDraftKeys,
  forgetConversationDrafts,
} from "./conversation-drafts";
import { queryClient } from "./query-client";
import type { Agent } from "./types";

/**
 * Resolve everything a deleted agent will have left unsent — its free-form chat
 * AND every mission it owned, each with the half-walked interaction card beside
 * it — and hand back the one call that retires it.
 *
 * Two halves, because they belong on opposite sides of the delete. The keys are
 * READ first: the missions are reachable only through the query cache (the
 * agent store holds agents, not conversations), the roster reload races the
 * delete response, and the next activity sweep drops the rows — so a lookup
 * made afterwards can find nothing to retire. The retirement itself runs LAST,
 * on success only: a delete that failed left the agent, and its unsent work,
 * exactly where they were.
 *
 * The cache lookup lives here rather than in the store, which keeps no cache
 * knowledge.
 */
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
