import {
  deriveInstalledSkillEditorState,
  type RepoSkill,
} from "@houston-ai/skills";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateSkill,
  useDeleteSkill,
  useInstallSkillFromRepo,
  useListSkillsFromRepo,
  useSaveSkill,
  useSkillDetail,
  useSkills,
} from "../../hooks/queries";
import { isMissingSkillError } from "../../lib/missing-skill";
import { queryKeys } from "../../lib/query-keys";
import { useUIStore } from "../../stores/ui";
import { useCommunitySkillHandlers } from "./use-community-skill-handlers";

export function useSkillSurface(agentPath: string) {
  const { t } = useTranslation("skills");
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const { data: summaries, isLoading: skillsLoading } = useSkills(agentPath);

  // The one installed skill whose edit modal is open, if any. Only one at a
  // time — opening another swaps it.
  const [editingSkillName, setEditingSkillName] = useState<string | null>(null);
  // Render-time reset on agent switch — a useEffect would race the
  // auto-toast in `call()` because the stale-name fetch starts first.
  const [prevAgentPath, setPrevAgentPath] = useState(agentPath);
  if (agentPath !== prevAgentPath) {
    setPrevAgentPath(agentPath);
    setEditingSkillName(null);
  }

  const { data: skillDetail, error: skillDetailError } = useSkillDetail(
    agentPath,
    editingSkillName ?? undefined,
  );

  // A missing-skill 404 (renamed, deleted, never installed) is expected, not a
  // bug: `tauriSkills.load` keeps it off the red toast / Sentry path, so surface
  // it plainly here — a friendly note, close the modal, refetch the list so the
  // dead row vanishes. Any OTHER load error stays in the modal's error state
  // below. (HOU-515 / HOU-441)
  const missingSkill =
    !!editingSkillName && isMissingSkillError(skillDetailError);
  useEffect(() => {
    if (!missingSkill) return;
    addToast({
      title: t("detail.unavailableToast.title"),
      description: t("detail.unavailableToast.description"),
      variant: "info",
    });
    setEditingSkillName(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.skills(agentPath) });
  }, [missingSkill, agentPath, addToast, queryClient, t]);

  const editorState = deriveInstalledSkillEditorState({
    expanded: editingSkillName != null,
    content: skillDetail?.content,
    hasError: !!skillDetailError && !isMissingSkillError(skillDetailError),
  });

  const saveSkill = useSaveSkill(agentPath);
  const deleteSkill = useDeleteSkill(agentPath);
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

  const openEditSkill = useCallback((name: string) => {
    setEditingSkillName(name);
  }, []);

  const closeEditSkill = useCallback(() => {
    setEditingSkillName(null);
  }, []);

  const handleSaveEditing = useCallback(
    async (content: string) => {
      if (!editingSkillName) return;
      await saveSkill.mutateAsync({ name: editingSkillName, content });
      setEditingSkillName(null);
    },
    [editingSkillName, saveSkill],
  );

  const handleSkillDelete = useCallback(
    async (name: string) => {
      await deleteSkill.mutateAsync(name);
      setEditingSkillName((prev) => (prev === name ? null : prev));
    },
    [deleteSkill],
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
    skills: summaries ?? [],
    skillsLoading,
    editingSkillName,
    editorState,
    openEditSkill,
    closeEditSkill,
    handleSaveEditing,
    handleSkillDelete,
    handleSearch,
    handleInstallCommunity,
    handlePreview,
    handleListFromRepo,
    handleInstallFromRepo,
    handleCreateFromScratch,
    installedSkillNames,
  };
}
