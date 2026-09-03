import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useStaleRosterHeal } from "../../hooks/use-stale-roster-heal";
import {
  agentRosterSettled,
  isStaleRosterReadError,
} from "../../lib/agent-gone";
import { analytics } from "../../lib/analytics";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import { sharedSkillsAvailable } from "../../lib/shared-skills-availability";
import { tauriSharedSkills, tauriSkillsManifest } from "../../lib/tauri";
import type { SkillSummary } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";

/**
 * The per-agent view of the workspace skill store (ADR 0003): the store's
 * skills, which of them THIS agent's manifest enables, and the one write —
 * a reversible manifest enable, never a copy. Shared by the Custom tab's
 * "From your workspace" section, the merged "Your skills" strip, and the
 * settings sidebar's count badge; the queries ride the same keys the global
 * Skills page uses, so all surfaces share one cache and one invalidation.
 */
export function useAgentSharedSkills(agentPath: string): {
  /** The deployment serves the store AND a workspace is active. */
  available: boolean;
  workspaceId: string | null;
  /** The workspace store's skills (empty until loaded / unavailable). */
  items: SkillSummary[];
  /** Store slugs this agent's manifest enables. */
  activeSlugs: Set<string>;
  /** Slug with a manifest write in flight, or null. */
  busy: string | null;
  enable: (slug: string) => Promise<void>;
  /** The reverse write — the skill stays in the store, this agent stops
   *  loading it. */
  disable: (slug: string) => Promise<void>;
} {
  const queryClient = useQueryClient();
  const { capabilities } = useCapabilities();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const advertised =
    capabilities?.sharedSkills === true && workspaceId !== null;

  const shared = useQuery({
    queryKey: queryKeys.sharedSkills(workspaceId ?? ""),
    queryFn: () => tauriSharedSkills.list(workspaceId ?? ""),
    enabled: advertised,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  // The manifest is agent-local and independent of the store, so it loads in
  // PARALLEL with the store query — gating it on the store's answer would
  // serialize two round trips for every configured deployment. It IS gated on
  // the roster having settled for the current space: a space switch wipes the
  // cache and would refire this query for the PREVIOUS space's agent under the
  // new org — a guaranteed `404 agent not found` (HOUSTON-APP-544). A genuine
  // 404 (agent deleted elsewhere) or 403 (unassigned elsewhere) is silenced —
  // an expected stale-roster state, surfaced by the heal below — never a red
  // bug toast.
  const rosterSettled = useAgentStore(agentRosterSettled);
  const manifest = useQuery({
    queryKey: queryKeys.skillsManifest(agentPath),
    queryFn: () =>
      tauriSkillsManifest.get(agentPath, { silence: isStaleRosterReadError }),
    enabled: advertised && rosterSettled,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  // Inline surfacing for the silenced 404/403: reload the roster so the ghost
  // agent (and this whole surface with it) disappears on its own.
  useStaleRosterHeal(isStaleRosterReadError(manifest.error));

  // The gateway advertises `capabilities.sharedSkills` unconditionally, even
  // where no skill store is actually bound — so the store's own answer is the
  // last word: the section hides rather than showing a permanently empty
  // "From your workspace" (HOU-1153).
  const available = sharedSkillsAvailable(advertised, shared.data);

  const [busy, setBusy] = useState<string | null>(null);
  const setEnabled = async (slug: string, on: boolean) => {
    if (busy) return;
    setBusy(slug);
    try {
      const current = await tauriSkillsManifest.get(agentPath);
      const next = new Set(current.enabled);
      if (on) next.add(slug);
      else next.delete(slug);
      await tauriSkillsManifest.set(agentPath, {
        version: 1,
        enabled: [...next].sort(),
      });
      if (on)
        analytics.track("skill_installed", {
          skill_slug: slug,
          source: "workspace-enable",
        });
      else analytics.track("skill_disabled", { skill_slug: slug });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.skillsManifest(agentPath),
      });
    } catch (err) {
      // call() already toasted the write failure; log so it isn't silent.
      logger.error(
        `[skills] ${on ? "enable" : "disable"} shared ${slug} failed: ${err}`,
      );
    } finally {
      setBusy(null);
    }
  };

  const activeSlugs = useMemo(
    () => new Set(manifest.data?.enabled ?? []),
    [manifest.data],
  );

  return {
    available,
    workspaceId,
    items: available ? (shared.data?.items ?? []) : [],
    activeSlugs,
    busy,
    enable: (slug: string) => setEnabled(slug, true),
    disable: (slug: string) => setEnabled(slug, false),
  };
}
