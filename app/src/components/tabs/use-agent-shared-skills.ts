import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { analytics } from "../../lib/analytics";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import { tauriSharedSkills, tauriSkillsManifest } from "../../lib/tauri";
import type { SkillSummary } from "../../lib/types";
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
  /** Slug with an enable in flight, or null. */
  busy: string | null;
  enable: (slug: string) => Promise<void>;
} {
  const queryClient = useQueryClient();
  const { capabilities } = useCapabilities();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const available = capabilities?.sharedSkills === true && workspaceId !== null;

  const shared = useQuery({
    queryKey: queryKeys.sharedSkills(workspaceId ?? ""),
    queryFn: () => tauriSharedSkills.list(workspaceId ?? ""),
    enabled: available,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const manifest = useQuery({
    queryKey: queryKeys.skillsManifest(agentPath),
    queryFn: () => tauriSkillsManifest.get(agentPath),
    enabled: available,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const enable = async (slug: string) => {
    if (busy) return;
    setBusy(slug);
    try {
      const current = await tauriSkillsManifest.get(agentPath);
      const next = new Set(current.enabled);
      next.add(slug);
      await tauriSkillsManifest.set(agentPath, {
        version: 1,
        enabled: [...next].sort(),
      });
      analytics.track("skill_installed", {
        skill_slug: slug,
        source: "workspace-enable",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.skillsManifest(agentPath),
      });
    } catch (err) {
      // call() already toasted the write failure; log so it isn't silent.
      logger.error(`[skills] enable shared ${slug} failed: ${err}`);
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
    enable,
  };
}
