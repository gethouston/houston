import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { analytics } from "../../lib/analytics";
import { logAndReportError } from "../../lib/error-report";
import { queryKeys } from "../../lib/query-keys";
import { tauriSharedSkills } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

/** A create-chat claim asks the SDK to apply the workspace sharing default. */
export function useOrgSkillDefault(agent: Agent): (slug: string) => void {
  const { t } = useTranslation("skills");
  const queryClient = useQueryClient();
  const { capabilities } = useCapabilities();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const addToast = useUIStore((s) => s.addToast);
  // A claim is one-shot. While capabilities load, the SDK handles an absent
  // store's refusal so a startup race cannot drop the sharing default.
  const advertised = capabilities?.sharedSkills !== false;
  return useCallback(
    (slug: string) => {
      if (!advertised || workspaceId === null) return;
      void tauriSharedSkills
        .shareNew(workspaceId, agent.folderPath, slug, {
          // The merged strip needs the shared row before the local delete's event
          // removes its old row, or it closes the setup chat as a missing skill.
          beforeDelete: async () => {
            await Promise.all([
              queryClient.refetchQueries({
                queryKey: queryKeys.sharedSkills(workspaceId),
              }),
              queryClient.refetchQueries({
                queryKey: queryKeys.skillsManifest(agent.folderPath),
              }),
            ]);
          },
        })
        .then((result) => {
          if (result.outcome !== "shared") return;
          analytics.track("skill_installed", {
            skill_slug: slug,
            source: "org-default",
          });
          addToast({ title: t("global.createdShared"), variant: "success" });
        })
        .catch((error: unknown) =>
          logAndReportError("skill_share_default", error),
        )
        .finally(() => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.sharedSkills(workspaceId),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.skillsManifest(agent.folderPath),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.skills(agent.folderPath),
          });
          void queryClient.invalidateQueries({
            queryKey: ["skill-detail", agent.folderPath],
          });
        });
    },
    [advertised, workspaceId, agent.folderPath, queryClient, addToast, t],
  );
}
