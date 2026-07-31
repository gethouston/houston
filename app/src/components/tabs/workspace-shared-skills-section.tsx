import {
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
  CatalogSectionHeader,
} from "@houston-ai/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { analytics } from "../../lib/analytics";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import { tauriSharedSkills, tauriSkillsManifest } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaces";
import { SkillIcon } from "../skill-icon";

/**
 * "From your workspace" (ADR 0003): the workspace store's shared skills,
 * offered on THIS agent's Custom tab so enabling one here is one click — a
 * reversible manifest write, never a copy. The shared-store sibling of
 * "From your other agents": once a skill is shared it stops living ON
 * agents, so that section can no longer offer it — this one does. Skills
 * already active here (manifest-enabled, or shadowed by a local copy) show
 * a quiet check. Renders nothing on deployments without the store.
 */
export function WorkspaceSharedSkillsSection({
  agent,
  installedSkillNames,
}: {
  agent: Agent;
  /** Lowercase slugs already on THIS agent — their rows show the check. */
  installedSkillNames?: Set<string>;
}) {
  const { t } = useTranslation("skills");
  const queryClient = useQueryClient();
  const { capabilities } = useCapabilities();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const enabled = capabilities?.sharedSkills === true && workspaceId !== null;

  // The same query keys/fns the global page uses, so the cache is shared.
  const shared = useQuery({
    queryKey: queryKeys.sharedSkills(workspaceId ?? ""),
    queryFn: () => tauriSharedSkills.list(workspaceId ?? ""),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const manifest = useQuery({
    queryKey: queryKeys.skillsManifest(agent.folderPath),
    queryFn: () => tauriSkillsManifest.get(agent.folderPath),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const enable = async (slug: string) => {
    if (busy) return;
    setBusy(slug);
    try {
      const current = await tauriSkillsManifest.get(agent.folderPath);
      const next = new Set(current.enabled);
      next.add(slug);
      await tauriSkillsManifest.set(agent.folderPath, {
        version: 1,
        enabled: [...next].sort(),
      });
      analytics.track("skill_installed", {
        skill_slug: slug,
        source: "workspace-enable",
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillsManifest(agent.folderPath),
      });
    } catch (err) {
      // call() already toasted the write failure; log so it isn't silent.
      logger.error(`[skills] enable shared ${slug} failed: ${err}`);
    } finally {
      setBusy(null);
    }
  };

  const items = shared.data?.items ?? [];
  if (!enabled || items.length === 0) return null;
  const active = new Set(manifest.data?.enabled ?? []);

  return (
    <div className="flex flex-col gap-3">
      <CatalogSectionHeader
        title={t("fromWorkspace.heading")}
        count={items.length}
        size="lg"
      />
      <CatalogGrid>
        {items.map((skill) => {
          const title = skillDisplayTitle(skill);
          const activeHere =
            active.has(skill.name) ||
            (installedSkillNames?.has(skill.name.toLowerCase()) ?? false);
          return (
            <CatalogRow
              key={skill.name}
              icon={
                <SkillIcon
                  image={skill.image}
                  bubbleClassName="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input"
                />
              }
              title={title}
              description={skill.description || undefined}
              trailing={
                activeHere ? (
                  <span
                    role="img"
                    aria-label={t("fromWorkspace.enabledAria", {
                      name: title,
                    })}
                    className="flex size-7 shrink-0 items-center justify-center text-ink-muted"
                  >
                    <Check aria-hidden className="size-4" />
                  </span>
                ) : (
                  <CatalogAddButton
                    label={t("fromWorkspace.enableAria", { name: title })}
                    busy={busy === skill.name}
                    onClick={() => void enable(skill.name)}
                  />
                )
              }
            />
          );
        })}
      </CatalogGrid>
    </div>
  );
}
