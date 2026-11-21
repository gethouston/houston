import { useMemo } from "react";
import type { RawConversation } from "../../lib/conversations-facade";
import { sweepSettled } from "../../lib/sweep-settled";
import { useAgentStore } from "../../stores/agents";
import { useAllConversations } from "./use-conversations";

const EMPTY_ROWS: readonly RawConversation[] = [];

export interface SettledConversations {
  rows: readonly RawConversation[];
  settled: boolean;
  count: number | null;
}

export function useSettledConversations(): SettledConversations {
  const agents = useAgentStore((s) => s.agents);
  const rosterLoaded = useAgentStore((s) => s.loaded);
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const conversations = useAllConversations(agentPaths);

  const rows = conversations.data ?? EMPTY_ROWS;
  const settled = sweepSettled({
    rosterLoaded,
    agentCount: agentPaths.length,
    hasData: conversations.data !== undefined,
    isFetching: conversations.isFetching,
  });
  return { rows, settled, count: settled ? rows.length : null };
}
