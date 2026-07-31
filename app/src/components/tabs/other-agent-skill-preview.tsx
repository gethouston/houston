import type { CommunitySkill, SkillPreviewState } from "@houston-ai/skills";
import { SkillPreviewModal } from "@houston-ai/skills";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSkillDetail } from "../../hooks/queries";
import { skillIntegrationSlugs } from "../../lib/skill-integrations";
import { skillBodyOf } from "../../lib/skill-md";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { IntegrationBadges } from "../integrations";
import { useSkillMarketplaceSectionLabels } from "./use-skill-surface-labels";

interface Props {
  /** The row under preview; null keeps the modal closed. */
  row: WorkspaceSkillRow | null;
  onClose: () => void;
  install: (row: WorkspaceSkillRow) => void;
  /** Slug currently installing (drives the button's spinner), or null. */
  installing: string | null;
  /** Lowercase slugs already on THIS agent — flips the button to Installed. */
  installedSkillNames?: Set<string>;
}

/**
 * The "From your other agents" preview (HOU-792): the same
 * {@link SkillPreviewModal} the marketplace and the Houston library open —
 * title, description, connected apps, category, and the full step-by-step
 * body behind the expander — so a cross-agent row NEVER installs on click;
 * the modal's Install button is the one commit point. Unlike the bundled
 * library, the body lives on the holder agent, so it loads on open (the
 * skeleton state) through the same `useSkillDetail` cache the manage dialog
 * reads. The by-line names the holder: "From the {agent} agent".
 */
export function OtherAgentSkillPreview({
  row,
  onClose,
  install,
  installing,
  installedSkillNames,
}: Props) {
  const { t } = useTranslation("skills");
  const marketplaceLabels = useSkillMarketplaceSectionLabels();
  const { data: detail, error } = useSkillDetail(
    row?.agents[0]?.folderPath,
    row?.slug,
  );

  const modalSkill: CommunitySkill | null = useMemo(
    () =>
      row
        ? {
            id: row.slug,
            skillId: row.slug,
            name: row.slug,
            installs: 0,
            source: `agent/${row.agents[0]?.id ?? ""}`,
          }
        : null,
    [row],
  );
  const preview: SkillPreviewState = useMemo(() => {
    if (!row) return { status: "loading" };
    if (error) return { status: "error" };
    if (!detail) return { status: "loading" };
    return {
      status: "loaded",
      preview: {
        title: row.summary.title,
        description: row.summary.description,
        image: row.summary.image,
        category: row.summary.category,
        tags: row.summary.tags,
        integrations: row.summary.integrations,
        content: skillBodyOf(detail.content) || null,
      },
    };
  }, [row, detail, error]);

  return (
    <SkillPreviewModal
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      skill={modalSkill}
      preview={preview}
      installing={installing !== null && installing === row?.slug}
      installed={!!row && !!installedSkillNames?.has(row.slug.toLowerCase())}
      onInstall={() => row && install(row)}
      renderIntegrations={(slugs) => (
        <IntegrationBadges
          toolkits={skillIntegrationSlugs(slugs)}
          label={t("detail.integrations")}
        />
      )}
      labels={{
        ...marketplaceLabels.preview,
        bySource: () =>
          t("library.fromAgent", { agent: row?.agents[0]?.name ?? "" }),
      }}
    />
  );
}
