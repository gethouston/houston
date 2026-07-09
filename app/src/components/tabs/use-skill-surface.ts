import type { CommunitySkill, RepoSkill, Skill } from "@houston-ai/skills";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateSkill,
  useDeleteSkill,
  useInstallCommunitySkill,
  useInstallSkillFromRepo,
  useListSkillsFromRepo,
  useSaveSkill,
  useSkillDetail,
  useSkills,
  useTranslateSkill,
} from "../../hooks/queries";
import { normalizeLocale } from "../../lib/locale";
import { isMissingSkillError } from "../../lib/missing-skill";
import { queryKeys } from "../../lib/query-keys";
import { tauriSkills } from "../../lib/tauri";
import type { SkillTranslateMode } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { resolveLoadingSkillName } from "./skill-loading-model";
import { useSkillSurfaceLabels } from "./use-skill-surface-labels";

export function useSkillSurface(agentPath: string) {
  const { t, i18n } = useTranslation("skills");
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const { skillDetailLabels } = useSkillSurfaceLabels();
  const { data: summaries, isLoading: skillsLoading } = useSkills(agentPath);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(
    null,
  );
  // Render-time reset on agent switch — a useEffect would race the
  // auto-toast in `call()` because the stale-name fetch starts first.
  const [prevAgentPath, setPrevAgentPath] = useState(agentPath);
  // The post-install translate offer (HOU-733): slugs the last install added,
  // pending the user's choice. Only set when the app runs in a non-English
  // locale — an English app installing an English skill has nothing to offer.
  const [translateOffer, setTranslateOffer] = useState<string[]>([]);
  const [translating, setTranslating] = useState(false);
  if (agentPath !== prevAgentPath) {
    setPrevAgentPath(agentPath);
    setSelectedSkillName(null);
    setTranslateOffer([]);
  }
  const {
    data: skillDetail,
    error: skillDetailError,
    isFetching: skillDetailFetching,
  } = useSkillDetail(agentPath, selectedSkillName ?? undefined);

  // The skill whose `load_skill` fetch is in flight, so the grid can disable
  // and spin just that card instead of letting a slow/failed load get
  // rage-clicked into duplicate fetches (HOU-464).
  const loadingSkillName = resolveLoadingSkillName(
    selectedSkillName,
    skillDetailFetching,
    !!skillDetail,
  );

  // A selected skill that no longer resolves (renamed, deleted, or never
  // installed) makes the host answer 404. `tauriSkills.load` keeps that off the
  // red bug-toast / Sentry path, so surface it plainly here: a friendly note,
  // drop the stale selection, and refetch the list so the dead card vanishes.
  // (HOU-515 / HOU-441)
  useEffect(() => {
    if (!selectedSkillName || !isMissingSkillError(skillDetailError)) return;
    addToast({
      title: t("detail.unavailableToast.title"),
      description: t("detail.unavailableToast.description"),
      variant: "info",
    });
    setSelectedSkillName(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.skills(agentPath) });
  }, [
    skillDetailError,
    selectedSkillName,
    agentPath,
    addToast,
    queryClient,
    t,
  ]);
  const saveSkill = useSaveSkill(agentPath);
  const deleteSkill = useDeleteSkill(agentPath);
  const createSkill = useCreateSkill(agentPath);
  const installCommunity = useInstallCommunitySkill(agentPath);
  const listFromRepo = useListSkillsFromRepo(agentPath);
  const installFromRepo = useInstallSkillFromRepo(agentPath);

  const selectedSkill: Skill | undefined =
    selectedSkillName && skillDetail
      ? {
          id: selectedSkillName,
          name: skillDetail.name,
          title: skillDetail.title,
          description: skillDetail.description,
          instructions: skillDetail.content,
          file_path: selectedSkillName,
        }
      : undefined;

  /**
   * Lowercase set of locally-installed skill slugs. The create dialog uses
   * this to render "Already exists" badges before the user even tries to
   * save, preventing a confusing failure-on-click.
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
      tauriSkills.searchCommunity(agentPath, query, signal),
    [agentPath],
  );

  const handlePopular = useCallback(
    (signal?: AbortSignal) => tauriSkills.popularCommunity(agentPath, signal),
    [agentPath],
  );

  // The app locale a just-installed skill would translate INTO. English apps
  // never see the offer: marketplace skills are overwhelmingly English, and
  // detecting a foreign-language install reliably isn't worth a wrong prompt.
  const translateTarget = normalizeLocale(i18n.language);
  const translateLanguageName = useMemo(
    () =>
      translateTarget
        ? (new Intl.DisplayNames([translateTarget], { type: "language" }).of(
            translateTarget,
          ) ?? translateTarget)
        : "",
    [translateTarget],
  );
  const offerTranslation = useCallback(
    (slugs: string[]) => {
      const clean = slugs.filter((s) => s.trim());
      if (!translateTarget || translateTarget === "en" || !clean.length) return;
      setTranslateOffer(clean);
    },
    [translateTarget],
  );

  const translateSkill = useTranslateSkill(agentPath);
  const handleTranslateChoose = useCallback(
    async (mode: SkillTranslateMode) => {
      if (!translateTarget || translating) return;
      setTranslating(true);
      try {
        const results = await Promise.allSettled(
          translateOffer.map((slug) =>
            translateSkill.mutateAsync({
              name: slug,
              target: translateTarget,
              mode,
            }),
          ),
        );
        const failed = translateOffer.filter(
          (_, i) => results[i]?.status === "rejected",
        );
        if (failed.length === 0) {
          addToast({
            title: t("translate.doneToast.title", {
              count: translateOffer.length,
            }),
            description: t("translate.doneToast.description", {
              count: translateOffer.length,
            }),
            variant: "info",
          });
          setTranslateOffer([]);
          return;
        }
        // The host answers with a readable reason (provider not connected,
        // translation service busy, …) — surface it, don't genericize. Keep
        // only the FAILED slugs pending, so retrying never re-translates a
        // skill that already succeeded.
        const first = results.find(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        addToast({
          title: t("translate.errorToast.title"),
          description:
            first?.reason instanceof Error
              ? first.reason.message
              : String(first?.reason),
          variant: "error",
        });
        setTranslateOffer(failed);
      } finally {
        setTranslating(false);
      }
    },
    [translateOffer, translateTarget, translating, translateSkill, addToast, t],
  );

  const dismissTranslate = useCallback(() => setTranslateOffer([]), []);

  const handleInstallCommunity = useCallback(
    async (skill: CommunitySkill, signal?: AbortSignal) => {
      const slug = await installCommunity.mutateAsync({
        source: skill.source,
        skillId: skill.skillId,
        signal,
      });
      offerTranslation([slug]);
      return slug;
    },
    [installCommunity, offerTranslation],
  );

  const handleListFromRepo = useCallback(
    async (source: string) => listFromRepo.mutateAsync(source),
    [listFromRepo],
  );

  const handleInstallFromRepo = useCallback(
    async (source: string, skills: RepoSkill[]) => {
      const slugs = await installFromRepo.mutateAsync({ source, skills });
      offerTranslation(slugs);
      return slugs;
    },
    [installFromRepo, offerTranslation],
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
    loadingSkillName,
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
    // Post-install translate offer (HOU-733).
    translateOffer,
    translating,
    translateLanguageName,
    handleTranslateChoose,
    dismissTranslate,
  };
}
