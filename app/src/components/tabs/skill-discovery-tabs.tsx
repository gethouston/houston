import type { CatalogShellTab } from "@houston-ai/core";
import type { Activity } from "@houston-ai/engine-client";
import type { CommunitySkill, CommunitySkillPreview } from "@houston-ai/skills";
import { SkillMarketplaceSection } from "@houston-ai/skills";
import { useTranslation } from "react-i18next";
import { SkillCustomTab } from "./skill-custom-tab";
import { useSkillMarketplaceSectionLabels } from "./use-skill-surface-labels";

/**
 * The Skills surface's two discovery tabs for {@link CatalogShell}: **Store**
 * (the skills.sh marketplace section, with its own search + category controls)
 * and **Custom skills** ({@link SkillCustomTab}: agent-guided create chats
 * first — HOU-791 — with the GitHub / From-scratch dialog as the secondary
 * path). Each tab is present only when its capability is: the Store needs the
 * community search/install callbacks, the Custom tab needs `showCustom` (an
 * add flow available in a writable surface). Read-only mode passes neither,
 * so the shell drops the tab chrome entirely.
 */
export function useSkillDiscoveryTabs(opts: {
  showCustom: boolean;
  onAddClick: () => void;
  /** Custom tab (HOU-791): start a new agent-guided create chat. */
  onCreateWithAi: () => void;
  /** Custom tab: unclaimed create-chats, shown as resumable rows. */
  drafts: Activity[];
  onResumeDraft: (activityId: string) => void;
  onDiscardDraft: (activityId: string) => void;
  /** The page's ONE search query, driving the Store marketplace's results. */
  query: string;
  onQueryChange: (q: string) => void;
  onSearch?: (query: string, signal?: AbortSignal) => Promise<CommunitySkill[]>;
  onInstallCommunity?: (
    skill: CommunitySkill,
    signal?: AbortSignal,
  ) => Promise<string>;
  onPreviewCommunity?: (
    skill: CommunitySkill,
    signal?: AbortSignal,
  ) => Promise<CommunitySkillPreview>;
  installedSkillNames?: Set<string>;
}): CatalogShellTab[] {
  const { t } = useTranslation("skills");
  const marketplaceLabels = useSkillMarketplaceSectionLabels();
  const { onSearch, onInstallCommunity } = opts;
  return [
    ...(onSearch && onInstallCommunity
      ? [
          {
            value: "store",
            label: t("tabs.store"),
            content: (
              <SkillMarketplaceSection
                onSearch={onSearch}
                onInstall={onInstallCommunity}
                onPreview={opts.onPreviewCommunity}
                installedSkillNames={opts.installedSkillNames}
                query={opts.query}
                onQueryChange={opts.onQueryChange}
                // The page's "Available" section header names this area, so the
                // marketplace drops its own redundant heading and keeps just the
                // Powered-by-Vercel caption.
                labels={{ ...marketplaceLabels, heading: undefined }}
              />
            ),
          },
        ]
      : []),
    ...(opts.showCustom
      ? [
          {
            value: "custom",
            label: t("tabs.custom"),
            content: (
              <SkillCustomTab
                drafts={opts.drafts}
                onResumeDraft={opts.onResumeDraft}
                onDiscardDraft={opts.onDiscardDraft}
                onCreateWithAi={opts.onCreateWithAi}
                onAddClick={opts.onAddClick}
              />
            ),
          },
        ]
      : []),
  ];
}
