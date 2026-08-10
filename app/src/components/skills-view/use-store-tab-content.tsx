import type { CommunitySkill } from "@houston-ai/skills";
import { SkillMarketplaceSection } from "@houston-ai/skills";
import { type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { skillIntegrationSlugs } from "../../lib/skill-integrations";
import { tauriSkills } from "../../lib/tauri";
import { useSkillMarketplaceSectionLabels } from "../agent/use-skill-surface-labels";
import { IntegrationBadges } from "../integrations";

/**
 * The global page's store catalog (HOU-792): the same
 * {@link SkillMarketplaceSection} an agent's Skills section mounts, its search/preview
 * riding ANY owned agent (read-only marketplace proxies; the hosted gateway
 * only proxies agent-scoped routes). Every install routes through the caller's
 * pick-agents flow. No agent means no content because the page shows its empty
 * state instead.
 */
export function useStoreTabContent(opts: {
  /** The agent id the read-only marketplace calls ride. */
  browsePath: string | undefined;
  query: string;
  onQueryChange: (q: string) => void;
  onInstall: (skill: CommunitySkill) => Promise<string>;
  /** Slugs installed on ANY agent — the "installed" check marks. */
  installedSkillNames: Set<string>;
}): ReactNode {
  const { t } = useTranslation("skills");
  const marketplaceLabels = useSkillMarketplaceSectionLabels();
  const { browsePath, onInstall } = opts;

  const handleSearch = useCallback(
    (query: string, signal?: AbortSignal) => {
      if (!browsePath) return Promise.resolve([]);
      return tauriSkills.searchCommunity(browsePath, query, signal);
    },
    [browsePath],
  );
  const handlePreview = useCallback(
    (skill: CommunitySkill, signal?: AbortSignal) => {
      if (!browsePath) throw new Error("no agent to browse through");
      return tauriSkills.previewCommunity(
        browsePath,
        skill.source,
        skill.skillId,
        signal,
      );
    },
    [browsePath],
  );

  if (!browsePath) return null;
  return (
    <SkillMarketplaceSection
      onSearch={handleSearch}
      onInstall={onInstall}
      onPreview={handlePreview}
      installedSkillNames={opts.installedSkillNames}
      renderIntegrations={(slugs) => (
        <IntegrationBadges
          toolkits={skillIntegrationSlugs(slugs)}
          label={t("detail.integrations")}
        />
      )}
      query={opts.query}
      onQueryChange={opts.onQueryChange}
      // The page's "Available" section header names this area, so the
      // marketplace drops its own redundant heading.
      labels={{ ...marketplaceLabels, heading: undefined }}
    />
  );
}
