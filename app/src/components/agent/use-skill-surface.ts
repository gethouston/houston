import type { RepoSkill } from "@houston-ai/skills";
import { useCallback, useMemo } from "react";
import {
  useCreateSkill,
  useInstallSkillFromRepo,
  useListSkillsFromRepo,
  useSkills,
} from "../../hooks/queries";
import { analytics } from "../../lib/analytics";
import { useCommunitySkillHandlers } from "./use-community-skill-handlers";

/**
 * What an agent's Skills section needs from the host: the installed list, and
 * the three ways a skill arrives (community search + install, a GitHub repo,
 * from scratch).
 *
 * Editing and deleting are NOT here. A skill's row opens the manage dialog
 * (`AgentSkillManageDialog`), which resolves the slug itself — a local copy is
 * written in place, a workspace-store skill's save writes the one shared copy —
 * so the content mutations live with that dialog's own actions.
 */
export function useSkillSurface(agentPath: string) {
  const { data: summaries, isLoading: skillsLoading } = useSkills(agentPath);

  const createSkill = useCreateSkill(agentPath);
  const listFromRepo = useListSkillsFromRepo(agentPath);
  const installFromRepo = useInstallSkillFromRepo(agentPath);
  const { handleSearch, handlePreview, handleInstallCommunity } =
    useCommunitySkillHandlers(agentPath);

  /**
   * Lowercase set of locally-installed skill slugs. The create dialog uses
   * this to render "Already exists" badges before the user even tries to
   * save, preventing a confusing failure-on-click.
   */
  const installedSkillNames = useMemo<Set<string>>(
    () => new Set((summaries ?? []).map((s) => s.name.toLowerCase())),
    [summaries],
  );

  const handleListFromRepo = useCallback(
    async (source: string) => listFromRepo.mutateAsync(source),
    [listFromRepo],
  );

  const handleInstallFromRepo = useCallback(
    async (source: string, skills: RepoSkill[]) => {
      const result = await installFromRepo.mutateAsync({ source, skills });
      for (const s of skills)
        analytics.track("skill_installed", {
          skill_slug: s.name,
          source: "repo",
        });
      return result;
    },
    [installFromRepo],
  );

  const handleCreateFromScratch = useCallback(
    async (input: { name: string; description: string; content: string }) => {
      await createSkill.mutateAsync(input);
      analytics.track("skill_installed", {
        skill_slug: input.name,
        source: "scratch",
      });
      return input.name;
    },
    [createSkill],
  );

  return {
    skills: summaries ?? [],
    skillsLoading,
    handleSearch,
    handleInstallCommunity,
    handlePreview,
    handleListFromRepo,
    handleInstallFromRepo,
    handleCreateFromScratch,
    installedSkillNames,
  };
}
