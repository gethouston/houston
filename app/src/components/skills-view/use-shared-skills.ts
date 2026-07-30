import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "../../lib/query-keys";
import { tauriSharedSkills, tauriSkillsManifest } from "../../lib/tauri";
import type { Agent, SkillSummary } from "../../lib/types";
import {
  aggregateSharedSkills,
  type SharedSkillRow,
} from "../../lib/workspace-shared-skills";

/**
 * The shared-store model behind the global Skills page when the deployment
 * serves it (`capabilities.sharedSkills`, ADR 0003): ONE store query plus one
 * host-local manifest query per agent — no per-agent pod fan-out for the list
 * itself. Same fetch-once-then-event-driven discipline as the copy-based hook
 * (`SharedSkillsChanged` / `SkillsChanged` invalidate these keys).
 */
export function useSharedSkills(args: {
  enabled: boolean;
  workspaceId: string | null;
  agents: Agent[];
  /** folderPath → agent-local skill list, from `useWorkspaceSkills`. */
  listsByPath: Map<string, SkillSummary[] | undefined>;
}): {
  rows: SharedSkillRow[];
  sharedSlugs: Set<string>;
  loading: boolean;
} {
  const { enabled, workspaceId, agents, listsByPath } = args;
  const shared = useQuery({
    queryKey: queryKeys.sharedSkills(workspaceId ?? ""),
    queryFn: () => tauriSharedSkills.list(workspaceId ?? ""),
    enabled: enabled && workspaceId !== null,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const { manifests, manifestsLoading } = useQueries({
    queries: enabled
      ? agents.map((agent) => ({
          queryKey: queryKeys.skillsManifest(agent.folderPath),
          queryFn: () => tauriSkillsManifest.get(agent.folderPath),
          staleTime: Number.POSITIVE_INFINITY,
          refetchOnWindowFocus: false,
        }))
      : [],
    combine: (results) => ({
      manifests: results.map((r) => r.data?.enabled),
      manifestsLoading: results.some((r) => r.isLoading),
    }),
  });

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
    loading: enabled && (shared.isLoading || manifestsLoading),
  };
}
