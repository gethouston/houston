import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { getEngine } from "../../lib/engine";

/**
 * Cross-agent fan-out helper — returns the set of agent paths whose most
 * recent Beltic `agent_authorization` credential is `active`. Used by
 * Mission Control to render a "Verified by Beltic" tag on cards from
 * authorized agents.
 *
 * Stays in sync via the same WS event invalidator chunk 4 wired up for
 * the per-agent hook — invalidating `["agent-credentials", agentPath]`
 * causes the matching query here to refetch.
 */
export function useVerifiedAgentPaths(agentPaths: string[]): Set<string> {
  const queries = useQueries({
    queries: agentPaths.map((agentPath) => ({
      queryKey: ["agent-credentials", agentPath],
      queryFn: () => getEngine().listAgentCredentials(agentPath),
      enabled: Boolean(agentPath),
      // Mission Control isn't credentials-focused — soft refresh policy.
      staleTime: 30_000,
    })),
  });

  return useMemo(() => {
    const out = new Set<string>();
    queries.forEach((q, i) => {
      const list = q.data ?? [];
      for (let j = list.length - 1; j >= 0; j--) {
        if (list[j].status === "active") {
          out.add(agentPaths[i]);
          break;
        }
      }
    });
    return out;
  }, [queries, agentPaths]);
}
