import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { isStaleRosterReadError } from "../../lib/agent-gone";
import { queryKeys } from "../../lib/query-keys";
import { tauriSkills } from "../../lib/tauri";
import type { Agent, SkillSummary } from "../../lib/types";
import {
  aggregateWorkspaceSkills,
  type WorkspaceSkillRow,
} from "../../lib/workspace-skills";
import { everyReadAnswered } from "./workspace-skill-acts";

export function useWorkspaceSkills(agents: Agent[]): {
  rows: WorkspaceSkillRow[];
  listsByPath: Map<string, SkillSummary[] | undefined>;
  loading: boolean;
  complete: boolean;
  failed: boolean;
  retry: () => void;
} {
  const { lists, loading, complete, failed, retry } = useQueries({
    queries: agents.map((agent) => ({
      queryKey: queryKeys.skills(agent.folderPath),
      queryFn: () => tauriSkills.list(agent.folderPath),
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => ({
      lists: results.map((r) => r.data),
      loading: results.some((r) => r.isLoading),
      complete: everyReadAnswered(results),
      failed: results.some(
        (r) => r.isError && !isStaleRosterReadError(r.error),
      ),
      retry: () => {
        for (const result of results) void result.refetch();
      },
    }),
  });

  const listsByPath = useMemo(
    () =>
      new Map<string, SkillSummary[] | undefined>(
        agents.map((agent, i) => [agent.folderPath, lists[i]]),
      ),
    [agents, lists],
  );

  const rows = useMemo(
    () => aggregateWorkspaceSkills(agents, listsByPath),
    [agents, listsByPath],
  );

  return { rows, listsByPath, loading, complete, failed, retry };
}
