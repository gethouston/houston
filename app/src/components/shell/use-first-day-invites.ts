import { useQueries } from "@tanstack/react-query";
import type { Config } from "../../data/config";
import { agentConfigQueryOptions } from "../../hooks/queries/use-agent-config";
import { useCapabilities } from "../../hooks/use-capabilities";
import { canEditAgentConfig } from "../../lib/agent-access";
import type { Agent } from "../../lib/types";
import type { AgentActivitySummary } from "./agent-activity-summary-model";
import { firstDayCandidates, firstDayInviteIds } from "./first-day-invites";

export function useFirstDayInvites(
  agents: Agent[],
  summaries: Record<string, AgentActivitySummary>,
): Set<string> {
  const { capabilities } = useCapabilities();
  const canStart = (agent: Agent) => canEditAgentConfig(capabilities, agent);
  const history = (id: string) => summaries[id]?.history ?? "unknown";
  const candidates = firstDayCandidates({ agents, history, canStart });
  const configs = useQueries({
    queries: candidates.map((agent) =>
      agentConfigQueryOptions(agent.folderPath),
    ),
  });
  const firstDayByPath = new Map<string, string | undefined>(
    candidates.map((agent, i) => [
      agent.folderPath,
      (configs[i]?.data as Config | undefined)?.firstDay,
    ]),
  );
  return firstDayInviteIds({
    agents,
    history,
    canStart,
    firstDay: (path) => firstDayByPath.get(path),
  });
}
