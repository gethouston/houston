import type { CommunitySkill, SkillPreviewState } from "@houston-ai/skills";
import { SkillPreviewModal } from "@houston-ai/skills";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { HoustonLibrarySkill } from "../../lib/houston-skill-library";
import { skillIntegrationSlugs } from "../../lib/skill-integrations";
import { IntegrationBadges } from "../integrations";
import { useSkillMarketplaceSectionLabels } from "./use-skill-surface-labels";

/** What the shelves put under preview: the skill + its shipping agent's name. */
export interface HoustonSkillPreviewTarget {
  skill: HoustonLibrarySkill;
  agentName: string;
}

interface Props {
  target: HoustonSkillPreviewTarget | null;
  onClose: () => void;
  install: (skill: HoustonLibrarySkill) => void;
  installing: string | null;
  installedSkillNames?: Set<string>;
}

/**
 * The Houston-library skill preview (HOU-791 follow-up): reuses the
 * marketplace's {@link SkillPreviewModal} — title, description, the apps it
 * works with, category, and the full step-by-step body behind the expander —
 * so a library row NEVER installs on click; the modal's Install button is the
 * one commit point. The bundle ships the whole SKILL.md, so the preview is
 * always instantly "loaded", and the by-line reads "From the {agent} agent"
 * instead of the marketplace's owner/repo source.
 */
export function HoustonSkillPreview({
  target,
  onClose,
  install,
  installing,
  installedSkillNames,
}: Props) {
  const { t } = useTranslation("skills");
  const marketplaceLabels = useSkillMarketplaceSectionLabels();

  const skill = target?.skill ?? null;
  const modalSkill: CommunitySkill | null = useMemo(
    () =>
      skill
        ? {
            id: skill.slug,
            skillId: skill.slug,
            name: skill.slug,
            installs: 0,
            source: `houston/${skill.agentId}`,
          }
        : null,
    [skill],
  );
  const preview: SkillPreviewState = useMemo(
    () =>
      skill
        ? {
            status: "loaded",
            preview: {
              title: skill.title,
              description: skill.description,
              image: skill.image,
              category: skill.category,
              tags: [],
              integrations: skill.integrations,
              content: skill.body || null,
            },
          }
        : { status: "loading" },
    [skill],
  );

  return (
    <SkillPreviewModal
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      skill={modalSkill}
      preview={preview}
      installing={installing !== null && installing === skill?.slug}
      installed={!!skill && !!installedSkillNames?.has(skill.slug)}
      onInstall={() => skill && install(skill)}
      renderIntegrations={(slugs) => (
        <IntegrationBadges
          toolkits={skillIntegrationSlugs(slugs)}
          label={t("detail.integrations")}
        />
      )}
      labels={{
        ...marketplaceLabels.preview,
        bySource: () =>
          t("library.fromAgent", { agent: target?.agentName ?? "" }),
      }}
    />
  );
}
