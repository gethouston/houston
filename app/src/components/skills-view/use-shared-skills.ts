import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useStaleRosterHeal } from "../../hooks/use-stale-roster-heal";
import {
  agentRosterSettled,
  isStaleRosterReadError,
} from "../../lib/agent-gone";
import { queryKeys } from "../../lib/query-keys";
import { tauriSharedSkills, tauriSkillsManifest } from "../../lib/tauri";
import type { Agent, SkillSummary } from "../../lib/types";
import {
  aggregateSharedSkills,
  type SharedSkillRow,
} from "../../lib/workspace-shared-skills";
import { useAgentStore } from "../../stores/agents";
import { everyReadAnswered } from "./workspace-skill-acts";

export function useSharedSkills(args: {
  enabled: boolean;
  workspaceId: string | null;
  agents: Agent[];
  listsByPath: Map<string, SkillSummary[] | undefined>;
}): {
  rows: SharedSkillRow[];
  sharedSlugs: Set<string>;
  loading: boolean;
  complete: boolean;
  failed: boolean;
  retry: () => void;
} {
  const { enabled, workspaceId, agents, listsByPath } = args;
  const shared = useQuery({
    queryKey: queryKeys.sharedSkills(workspaceId ?? ""),
    queryFn: () => tauriSharedSkills.list(workspaceId ?? ""),
    enabled: enabled && workspaceId !== null,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const rosterSettled = useAgentStore(agentRosterSettled);
  const {
    manifests,
    manifestsLoading,
    manifestsComplete,
    manifestsFailed,
    agentGone,
    retryManifests,
  } = useQueries({
    queries:
      enabled && rosterSettled
        ? agents.map((agent) => ({
            queryKey: queryKeys.skillsManifest(agent.folderPath),
            queryFn: () =>
              tauriSkillsManifest.get(agent.folderPath, {
                silence: isStaleRosterReadError,
              }),
            staleTime: Number.POSITIVE_INFINITY,
            refetchOnWindowFocus: false,
          }))
        : [],
    combine: (results) => ({
      manifests: results.map((r) => r.data?.enabled),
      manifestsLoading: results.some((r) => r.isLoading),
      manifestsComplete: everyReadAnswered(results),
      manifestsFailed: results.some(
        (r) => r.isError && !isStaleRosterReadError(r.error),
      ),
      agentGone: results.some((r) => isStaleRosterReadError(r.error)),
      retryManifests: () => {
        for (const result of results) void result.refetch();
      },
    }),
  });
  useStaleRosterHeal(agentGone);

  const manifestsByPath = useMemo(
    () =>
      new Map<string, readonly string[] | undefined>(
        agents.map((agent, i) => [agent.folderPath, manifests[i]]),
      ),
    [agents, manifests],
  );

  const rows = useMemo(
    () =>
      aggregateSharedSkills({
        shared: shared.data?.items ?? [],
        agents,
        manifestsByPath,
        listsByPath,
      }),
    [shared.data, agents, manifestsByPath, listsByPath],
  );

  const sharedSlugs = useMemo(
    () => new Set((shared.data?.items ?? []).map((s) => s.name.toLowerCase())),
    [shared.data],
  );

  return {
    rows,
    sharedSlugs,
    loading:
      enabled && (shared.isLoading || !rosterSettled || manifestsLoading),
    complete:
      !enabled || (shared.isSuccess && rosterSettled && manifestsComplete),
    failed: enabled && (shared.isError || manifestsFailed),
    retry: () => {
      void shared.refetch();
      retryManifests();
    },
  };
}
