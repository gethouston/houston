import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "../../lib/query-keys";
import { tauriSkills } from "../../lib/tauri";
import type { Agent, SkillSummary } from "../../lib/types";
import {
  aggregateWorkspaceSkills,
  type WorkspaceSkillRow,
} from "../../lib/workspace-skills";

/**
 * Every agent's skill list, aggregated for the global Skills page (HOU-792).
 *
 * One query PER agent on the same `queryKeys.skills(path)` keys the per-agent
 * tab uses, so `SkillsChanged` events and the existing mutations refresh this
 * page for free. Fetched once per mount and then event-driven only — in hosted
 * mode each fetch fans out to that agent's pod and resets its idle-sleep
 * clock, so focus/staleness sweeps are disabled exactly like
 * `useAllConversations`.
 */
export function useWorkspaceSkills(agents: Agent[]): {
  rows: WorkspaceSkillRow[];
  /** Lowercase slugs installed on ANY agent — the store's "installed" marks. */
  installedSkillNames: Set<string>;
  /** folderPath → that agent's current list (undefined while loading). */
  listsByPath: Map<string, SkillSummary[] | undefined>;
  loading: boolean;
} {
  const { lists, loading } = useQueries({
    queries: agents.map((agent) => ({
      queryKey: queryKeys.skills(agent.folderPath),
      queryFn: () => tauriSkills.list(agent.folderPath),
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => ({
      lists: results.map((r) => r.data),
      loading: results.some((r) => r.isLoading),
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

  const installedSkillNames = useMemo(
    () => new Set(rows.map((row) => row.slug.toLowerCase())),
    [rows],
  );

  return { rows, installedSkillNames, listsByPath, loading };
}
