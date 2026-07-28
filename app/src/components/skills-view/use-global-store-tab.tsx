import type { CatalogShellTab } from "@houston-ai/core";
import type { CommunitySkill } from "@houston-ai/skills";
import { SkillMarketplaceSection } from "@houston-ai/skills";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { skillIntegrationSlugs } from "../../lib/skill-integrations";
import { tauriSkills } from "../../lib/tauri";
import { IntegrationBadges } from "../integrations";
import { useSkillMarketplaceSectionLabels } from "../tabs/use-skill-surface-labels";

/**
 * The global page's skills.sh Store tab (HOU-792) — the same
 * {@link SkillMarketplaceSection} the per-agent tab mounts, with two twists:
 * search/preview are read-only marketplace proxies, so they ride ANY owned
 * agent (the first — the hosted gateway only proxies agent-scoped routes);
 * and install goes through the caller's `onInstall`, which opens the
 * pick-agents dialog before fanning out. Returns no tab without an agent to
 * browse through.
 */
export function useGlobalStoreTab(opts: {
  /** The agent id the read-only marketplace calls ride; undefined = no tab. */
  browsePath: string | undefined;
  query: string;
  onQueryChange: (q: string) => void;
  onInstall: (skill: CommunitySkill) => Promise<string>;
  /** Slugs installed on ANY agent — the "installed" check marks. */
  installedSkillNames: Set<string>;
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
  ];
}
