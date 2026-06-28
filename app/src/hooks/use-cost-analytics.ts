import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAgentStore } from "../stores/agents";
import { queryKeys } from "../lib/query-keys";
import { tauriConversations } from "../lib/tauri";
import { getEngine } from "../lib/engine";
import { isoToLocalDate } from "../lib/date-utils";
import { calcTokenCost } from "../lib/token-pricing";
import { aggregate, foldFinals, type AggregatedMetrics, type SessionResult, type FinalResultRow } from "../lib/cost-aggregate";

export type { SessionResult, AggregatedMetrics, AgentMetrics, ModelMetrics, DailyMetrics, HourlyMetrics } from "../lib/cost-aggregate";
export { applyFilter } from "../lib/cost-aggregate";

export interface CostAnalytics extends AggregatedMetrics {
  sessions: SessionResult[];
  models: string[];
  agents: { name: string; path: string }[];
  loading: boolean;
}

const CONCURRENCY = 6;

async function limitedAll<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    results.push(...await Promise.all(tasks.slice(i, i + limit).map((fn) => fn())));
  }
  return results;
}

/**
 * Read every conversation's final-result rows and fold them into one
 * SessionResult per conversation. The top-level conversation list goes through
 * the toast-on-error tauri wrapper; individual history reads use the engine
 * directly and skip on failure so one unreadable conversation can't blank the
 * whole dashboard.
 */
async function loadSessions(agentPaths: string[]): Promise<SessionResult[]> {
  const conversations = await tauriConversations.listAll(agentPaths);
  const engine = getEngine();
  const sessions: SessionResult[] = [];

  await limitedAll(
    conversations.map((conv) => async () => {
      try {
        const feed = await engine.loadChatHistory(conv.agent_path, conv.session_key);
        const finals = feed
          .filter((f) => f.feed_type === "final_result")
          .map((f) => f.data as FinalResultRow);
        if (!finals.length) return;

        sessions.push({
          agentName: conv.agent_name,
          agentPath: conv.agent_path,
          date: conv.updated_at ? isoToLocalDate(conv.updated_at) : "",
          hour: conv.updated_at ? new Date(conv.updated_at).getHours() : -1,
          ...foldFinals(finals, calcTokenCost),
        });
      } catch {
        // Skip a single unreadable conversation; the rest still aggregate.
      }
    }),
    CONCURRENCY,
  );

  return sessions;
}

export function useCostAnalytics(): CostAnalytics {
  const agents = useAgentStore((s) => s.agents);
  const agentPaths = agents.map((a) => a.folderPath);

  const query = useQuery({
    queryKey: queryKeys.costAnalytics(agentPaths),
    queryFn: () => loadSessions(agentPaths),
    enabled: agents.length > 0,
  });

  const sessions = useMemo(() => query.data ?? [], [query.data]);
  const metrics = useMemo(() => aggregate(sessions), [sessions]);
  const models = useMemo(
    () => [...new Set(sessions.map((s) => s.model).filter(Boolean))],
    [sessions],
  );
  const agentList = useMemo(
    () => agents.map((a) => ({ name: a.name, path: a.folderPath })),
    [agents],
  );

  return {
    ...metrics,
    sessions,
    models,
    agents: agentList,
    loading: agents.length > 0 && query.isPending,
  };
}
