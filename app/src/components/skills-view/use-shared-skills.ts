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
  /** The store read (or an agent's manifest) did not answer. Already toasted
   *  and reported at the call — the surface only says it. */
  failed: boolean;
  /** Read the store and every manifest again. */
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

  // Gated on the roster having settled for the current space, and with the
  // agent-gone 404 / not-readable 403 silenced: a space switch or a stale
  // roster must not turn this fan-out into a storm of red "agent not found"
  // toasts (HOUSTON-APP-544). A gone agent's row simply carries no manifest,
  // and the heal below removes it from the roster.
  const rosterSettled = useAgentStore(agentRosterSettled);
  const {
    manifests,
    manifestsLoading,
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
    loading: enabled && (shared.isLoading || manifestsLoading),
    failed: enabled && (shared.isError || manifestsFailed),
    retry: () => {
      void shared.refetch();
      retryManifests();
    },
  };
}
