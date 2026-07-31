import type { CatalogShellTab } from "@houston-ai/core";
import type { CommunitySkill } from "@houston-ai/skills";
import { SkillMarketplaceSection } from "@houston-ai/skills";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { skillIntegrationSlugs } from "../../lib/skill-integrations";
import { tauriSkills } from "../../lib/tauri";
import { IntegrationBadges } from "../integrations";
import { useSkillMarketplaceSectionLabels } from "../tabs/use-skill-surface-labels";
import { GlobalCustomTab } from "./global-custom-tab";

/**
 * The global page's discovery tabs (HOU-792): **Store** — the same
 * {@link SkillMarketplaceSection} the per-agent tab mounts, its search/preview
 * riding ANY owned agent (read-only marketplace proxies; the hosted gateway
 * only proxies agent-scoped routes) — and **Custom skills** — build with an
 * agent or add manually. Every install routes through the caller's
 * pick-agents flow. No agent → no tabs (the page shows its empty state
 * instead).
 */
export function useGlobalSkillTabs(opts: {
  /** The agent id the read-only marketplace calls ride; undefined = no tabs. */
  browsePath: string | undefined;
  query: string;
  onQueryChange: (q: string) => void;
  onInstall: (skill: CommunitySkill) => Promise<string>;
  /** Slugs installed on ANY agent — the "installed" check marks. */
  installedSkillNames: Set<string>;
  custom: {
    onCreateWithAi: () => void;
    onAddClick: () => void;
  };
}): CatalogShellTab[] {
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

  if (!browsePath) return [];
  return [
    {
      value: "store",
      label: t("tabs.store"),
      content: (
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
      ),
    },
    {
      value: "custom",
      label: t("tabs.custom"),
      content: (
        <GlobalCustomTab
          onCreateWithAi={opts.custom.onCreateWithAi}
          onAddClick={opts.custom.onAddClick}
        />
      ),
    },
  ];
}
