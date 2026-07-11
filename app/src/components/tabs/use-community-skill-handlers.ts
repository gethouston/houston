import { type CommunitySkill, classifySkillError } from "@houston-ai/skills";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useInstallCommunitySkill } from "../../hooks/queries";
import { tauriSkills } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";

/**
 * The skills.sh marketplace callbacks for the Discover section: search,
 * on-demand preview, and install. Split out of {@link useSkillSurface} so that
 * hook stays focused on the installed-skill list + detail concerns.
 */
export function useCommunitySkillHandlers(agentPath: string) {
  const { t } = useTranslation("skills");
  const addToast = useUIStore((s) => s.addToast);
  const installCommunity = useInstallCommunitySkill(agentPath);

  const handleSearch = useCallback(
    (query: string, signal?: AbortSignal) =>
      tauriSkills.searchCommunity(agentPath, query, signal),
    [agentPath],
  );

  const handlePreview = useCallback(
    (skill: CommunitySkill, signal?: AbortSignal) =>
      tauriSkills.previewCommunity(
        agentPath,
        skill.source,
        skill.skillId,
        signal,
      ),
    [agentPath],
  );

  const handleInstallCommunity = useCallback(
    async (skill: CommunitySkill, signal?: AbortSignal) => {
      try {
        return await installCommunity.mutateAsync({
          source: skill.source,
          skillId: skill.skillId,
          signal,
        });
      } catch (err) {
        // No-silent-failures: the marketplace card only re-enables its install
        // button on failure, so surface the real reason as a visible toast.
        // Classify per-kind so benign "already installed" reads as info, and
        // each failure gets copy the user can act on instead of one generic line.
        if (!signal?.aborted) {
          const kind = classifySkillError(err);
          if (kind === "already_installed") {
            addToast({
              title: t("store.installFailedAlready"),
              variant: "info",
            });
          } else {
            const key =
              kind === "skill_not_in_repo"
                ? "store.installFailedRepoMissing"
                : kind === "skill_malformed"
                  ? "store.installFailedMalformed"
                  : kind === "rate_limited" || kind === "github_rate_limited"
                    ? "store.installFailedRateLimited"
                    : kind === "offline"
                      ? "store.installFailedOffline"
                      : "store.installFailedGeneric";
            addToast({ title: t(key), variant: "error" });
          }
        }
        throw err;
      }
    },
    [installCommunity, addToast, t],
  );

  return { handleSearch, handlePreview, handleInstallCommunity };
}
