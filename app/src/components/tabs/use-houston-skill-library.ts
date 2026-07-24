import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { storeCatalogConfigs } from "../../agents/builtin/store-catalog";
import { loadStoreTemplate } from "../../agents/builtin/store-template-loader";
import { analytics } from "../../lib/analytics";
import {
  extractTemplateSkills,
  type HoustonLibrarySkill,
  withFeaturedFrontmatter,
} from "../../lib/houston-skill-library";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent } from "../../lib/tauri";

/** The library grouped the way it reads: by the pre-set agent that ships it. */
export interface HoustonLibraryGroup {
  agentId: string;
  agentName: string;
  skills: HoustonLibrarySkill[];
}

/**
 * The Custom tab's Houston skill library: every skill the release-bundled
 * pre-set agents ship (translated variant when the app runs es/pt), plus the
 * one-click install that writes the SKILL.md into THIS agent. The bundle is
 * static per release, so the parse runs once per locale and never refetches.
 */
export function useHoustonSkillLibrary(agentPath: string) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["houston-skill-library", locale.toLowerCase().split("-")[0]],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async (): Promise<HoustonLibraryGroup[]> => {
      const groups = await Promise.all(
        storeCatalogConfigs.map(async (config) => {
          const template = await loadStoreTemplate(config.id, locale);
          return {
            agentId: config.id,
            agentName: config.name,
            skills: extractTemplateSkills(config.id, template.seeds),
          };
        }),
      );
      return groups.filter((g) => g.skills.length > 0);
    },
  });

  // One install at a time; the slug in flight drives that row's spinner.
  const [installing, setInstalling] = useState<string | null>(null);
  const install = useCallback(
    async (skill: HoustonLibrarySkill) => {
      if (installing) return;
      setInstalling(skill.slug);
      try {
        await tauriAgent.writeFile(
          agentPath,
          `.agents/skills/${skill.slug}/SKILL.md`,
          withFeaturedFrontmatter(skill.content),
        );
        analytics.track("skill_installed", {
          skill_slug: skill.slug,
          source: "houston",
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.skills(agentPath),
        });
      } catch (err) {
        // call() already toasted the write failure; log so it isn't silent.
        logger.error(`[skill-library] install ${skill.slug} failed: ${err}`);
      } finally {
        setInstalling(null);
      }
    },
    [agentPath, installing, queryClient],
  );

  return {
    groups: query.data ?? [],
    loading: query.isLoading,
    failed: query.isError,
    retry: () => void query.refetch(),
    install: (skill: HoustonLibrarySkill) => void install(skill),
    installing,
  };
}
