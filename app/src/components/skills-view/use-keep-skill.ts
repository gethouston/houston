import { SkillTransferRefusalError } from "@houston/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { logAndReportError } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import { skillWriteRefresh } from "../../lib/skill-optimistic";
import { tauriSharedSkills } from "../../lib/tauri";

export function useKeepSkill() {
  const qc = useQueryClient();
  const { t } = useTranslation("skills");
  return async (
    workspaceId: string,
    agentPath: string,
    slug: string,
    onKept: () => void,
  ) => {
    try {
      await tauriSharedSkills.keepForAgent(workspaceId, agentPath, slug);
      onKept();
    } catch (error) {
      if (error instanceof SkillTransferRefusalError) {
        showExpectedStateToast(
          t("global.manage.keepOnly"),
          t(`global.manage.keepRefusal.${error.reason}`),
        );
      } else {
        logAndReportError("skill_keep_only_for_agent", error);
      }
    } finally {
      await Promise.all(
        skillWriteRefresh([agentPath], workspaceId).map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      );
    }
  };
}
