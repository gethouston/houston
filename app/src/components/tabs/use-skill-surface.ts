import { useCallback, useMemo, useState } from "react";
import type { CommunitySkill, RepoSkill, Skill } from "@houston-ai/skills";
import {
  useCreateSkill,
  useDeleteSkill,
  useInstallCommunitySkill,
  useInstallSkillFromRepo,
  useListSkillsFromRepo,
  useSaveSkill,
  useSkillDetail,
  useSkills,
} from "../../hooks/queries";
import { tauriSkills } from "../../lib/tauri";
import { useSkillSurfaceLabels } from "./use-skill-surface-labels";

export function useSkillSurface(agentPath: string) {
  const { skillDetailLabels } = useSkillSurfaceLabels();
  const { data: summaries, isLoading: skillsLoading } = useSkills(agentPath);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(
    null,
  );
  // Render-time reset on agent switch — a useEffect would race the
  // auto-toast in `call()` because the stale-name fetch starts first.
  const [prevAgentPath, setPrevAgentPath] = useState(agentPath);
  if (agentPath !== prevAgentPath) {
    setPrevAgentPath(agentPath);
    setSelectedSkillName(null);
  }
  const { data: skillDetail } = useSkillDetail(
    agentPath,
    selectedSkillName ?? undefined,
  );
  const saveSkill = useSaveSkill(agentPath);
  const deleteSkill = useDeleteSkill(agentPath);
  const createSkill = useCreateSkill(agentPath);
  const installCommunity = useInstallCommunitySkill(agentPath);
  const listFromRepo = useListSkillsFromRepo();
  const installFromRepo = useInstallSkillFromRepo(agentPath);

  const selectedSkill: Skill | undefined =
    selectedSkillName && skillDetail
      ? {
          id: selectedSkillName,
          name: skillDetail.name,
          description: skillDetail.description,
          instructions: skillDetail.content,
          file_path: selectedSkillName,
        }
      : undefined;

  /**
   * Lowercase set of locally-installed skill slugs. The marketplace UI
   * uses this to render "Already installed" badges before the user
   * even tries to click install, preventing a confusing failure-on-click.
   */
  const installedSkillNames = useMemo<Set<string>>(
    () => new Set((summaries ?? []).map((s) => s.name.toLowerCase())),
    [summaries],
  );

  const clearSelectedSkill = useCallback(() => {
    setSelectedSkillName(null);
  }, []);

  const handleSkillSave = useCallback(
    async (name: string, content: string) => {
      await saveSkill.mutateAsync({ name, content });
    },
    [saveSkill],
  );

  const handleSkillDelete = useCallback(
    async (name: string) => {
      await deleteSkill.mutateAsync(name);
      setSelectedSkillName(null);
    },
    [deleteSkill],
  );

  const handleSearch = useCallback(
    (query: string, signal?: AbortSignal) =>
      tauriSkills.searchCommunity(query, signal),
    [],
  );

  const handlePopular = useCallback(
    (signal?: AbortSignal) => tauriSkills.popularCommunity(signal),
    [],
  );

  const handleInstallCommunity = useCallback(
    async (skill: CommunitySkill, signal?: AbortSignal) =>
      installCommunity.mutateAsync({
        source: skill.source,
        skillId: skill.skillId,
        signal,
      }),
    [installCommunity],
  );

  const handleListFromRepo = useCallback(
    async (source: string) => listFromRepo.mutateAsync(source),
    [listFromRepo],
  );

  const handleInstallFromRepo = useCallback(
    async (source: string, skills: RepoSkill[]) =>
      installFromRepo.mutateAsync({ source, skills }),
    [installFromRepo],
  );

  const handleCreateFromScratch = useCallback(
    async (input: { name: string; description: string; content: string }) => {
      await createSkill.mutateAsync(input);
      return input.name;
    },
    [createSkill],
  );

  return {
    skillDetailLabels,
    skills: summaries ?? [],
    skillsLoading,
    selectedSkill,
    selectSkill: setSelectedSkillName,
    clearSelectedSkill,
    handleSkillSave,
    handleSkillDelete,
    handleSearch,
    handlePopular,
    handleInstallCommunity,
    handleListFromRepo,
    handleInstallFromRepo,
    handleCreateFromScratch,
    installedSkillNames,
  };
}
