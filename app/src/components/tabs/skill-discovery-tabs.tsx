import {
  Button,
  type CatalogShellTab,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import type { CommunitySkill, CommunitySkillPreview } from "@houston-ai/skills";
import { SkillMarketplaceSection } from "@houston-ai/skills";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSkillMarketplaceSectionLabels } from "./use-skill-surface-labels";

/**
 * The Skills surface's two discovery tabs for {@link CatalogShell}: **Store**
 * (the skills.sh marketplace section, with its own search + category controls)
 * and **Custom skills** (an empty state for now — the explanation + the Add CTA
 * opening the GitHub / From-scratch dialog). Each tab is present only when its
 * capability is: the Store needs the community search/install callbacks, the
 * Custom tab needs `showCustom` (an add flow available in a writable surface).
 * Read-only mode passes neither, so the shell drops the tab chrome entirely.
 */
export function useSkillDiscoveryTabs(opts: {
  showCustom: boolean;
  onAddClick: () => void;
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
              <Empty className="py-16">
                <EmptyHeader>
                  <EmptyTitle className="text-lg">
                    {t("tabs.customEmptyTitle")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t("tabs.customEmptyDescription")}
                  </EmptyDescription>
                </EmptyHeader>
                <Button type="button" onClick={opts.onAddClick}>
                  <Plus className="size-4" />
                  {t("grid.addSkill")}
                </Button>
              </Empty>
            ),
          },
        ]
      : []),
  ];
}
