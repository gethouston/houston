import type { CommunitySkill, SkillPreviewState } from "@houston-ai/skills";
import { SkillPreviewModal } from "@houston-ai/skills";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { queryKeys } from "../../lib/query-keys";
import { skillIntegrationSlugs } from "../../lib/skill-integrations";
import { skillBodyOf } from "../../lib/skill-md";
import { tauriSharedSkills } from "../../lib/tauri";
import type { SkillSummary } from "../../lib/types";
import { IntegrationBadges } from "../integrations";
import { useSkillMarketplaceSectionLabels } from "./use-skill-surface-labels";

interface Props {
  workspaceId: string;
  /** The store skill under preview; null keeps the modal closed. */
  skill: SkillSummary | null;
  /** Whether the skill is already active on the viewing agent. */
  enabled: boolean;
  /** An enable is in flight for this skill (drives the button spinner). */
  enabling: boolean;
  onEnable: (slug: string) => void;
  onClose: () => void;
}

/**
 * The workspace-store skill preview (ADR 0003): the same
 * {@link SkillPreviewModal} the marketplace and the cross-agent section open
 * — title, description, connected apps, and the full body behind the
 * expander — with the commit button meaning ENABLE (a reversible manifest
 * write), never a copy or an install. The body lives in the store, so it
 * loads on open through the shared-skills cache.
 */
export function WorkspaceSkillPreview({
  workspaceId,
  skill,
  enabled,
  enabling,
  onEnable,
  onClose,
}: Props) {
  const { t } = useTranslation("skills");
  const marketplaceLabels = useSkillMarketplaceSectionLabels();
  const { data: detail, error } = useQuery({
    queryKey: queryKeys.sharedSkillDetail(workspaceId, skill?.name ?? ""),
    queryFn: () => tauriSharedSkills.load(workspaceId, skill?.name ?? ""),
    enabled: skill !== null,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const modalSkill: CommunitySkill | null = useMemo(
    () =>
      skill
        ? {
            id: skill.name,
            skillId: skill.name,
            name: skill.name,
            installs: 0,
            source: `workspace/${workspaceId}`,
          }
        : null,
    [skill, workspaceId],
  );
  const preview: SkillPreviewState = useMemo(() => {
    if (!skill) return { status: "loading" };
    if (error) return { status: "error" };
    if (!detail) return { status: "loading" };
    return {
      status: "loaded",
      preview: {
        title: skill.title,
        description: skill.description,
        image: skill.image,
        category: skill.category,
        tags: skill.tags,
        integrations: skill.integrations,
        content: skillBodyOf(detail.content) || null,
      },
    };
  }, [skill, detail, error]);

  return (
    <SkillPreviewModal
      open={skill !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      skill={modalSkill}
      preview={preview}
      installing={enabling}
      installed={enabled}
      onInstall={() => skill && onEnable(skill.name)}
      renderIntegrations={(slugs) => (
        <IntegrationBadges
          toolkits={skillIntegrationSlugs(slugs)}
          label={t("detail.integrations")}
        />
      )}
      labels={{
        ...marketplaceLabels.preview,
        install: t("fromWorkspace.enable"),
        installing: t("fromWorkspace.enabling"),
        installed: t("fromWorkspace.enabled"),
        bySource: () => t("fromWorkspace.heading"),
      }}
    />
  );
}
