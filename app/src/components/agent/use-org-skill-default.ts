import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { analytics } from "../../lib/analytics";
import { logger } from "../../lib/logger";
import { isMissingSkillError } from "../../lib/missing-skill";
import {
  isOrgSkillShareDeclined,
  shareNewSkillToWorkspace,
} from "../../lib/org-skill-share";
import { queryKeys } from "../../lib/query-keys";
import {
  tauriSharedSkills,
  tauriSkills,
  tauriSkillsManifest,
} from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

const inFlight = new Set<string>();

export function useOrgSkillDefault(agent: Agent): (slug: string) => void {
  const { t } = useTranslation("skills");
  const queryClient = useQueryClient();
  const { capabilities } = useCapabilities();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const addToast = useUIStore((s) => s.addToast);
  const advertised =
    capabilities?.sharedSkills !== false && workspaceId !== null;

  return useCallback(
    (slug: string) => {
      if (!advertised || workspaceId === null) return;
      const key = `${workspaceId}/${slug}`;
      if (inFlight.has(key)) return;
      inFlight.add(key);
      shareNewSkillToWorkspace(
        {
          loadLocalContent: async (path, name) => {
            try {
              return (await tauriSkills.load(path, name)).content;
            } catch (err) {
              if (isMissingSkillError(err)) return null;
              throw err;
            }
          },
          promote: async (ws, name, content) => {
            await tauriSharedSkills.promote(ws, name, content, {
              silence: isOrgSkillShareDeclined,
            });
          },
          enable: async (path, name) => {
            await tauriSkillsManifest.setEnabled(path, name, true);
          },
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
          deleteLocal: (path, name) => tauriSkills.delete(path, name),
        },
        { workspaceId, creatorPath: agent.folderPath, slug },
      )
        .then((result) => {
          if (result.outcome !== "shared") {
            logger.info(
              `[org-skill] '${slug}' stayed agent-local (${result.outcome})`,
            );
            return;
          }
          queryClient.invalidateQueries({
            queryKey: queryKeys.sharedSkills(workspaceId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.skillsManifest(agent.folderPath),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.skills(agent.folderPath),
          });
          queryClient.invalidateQueries({
            queryKey: ["skill-detail", agent.folderPath],
          });
          analytics.track("skill_installed", {
            skill_slug: slug,
            source: "org-default",
          });
          if (result.creatorEnabled) {
            addToast({ title: t("global.createdShared"), variant: "success" });
          } else {
            logger.error(
              `[org-skill] '${slug}' creator manifest enable failed`,
            );
          }
        })
        .catch((err) =>
          logger.error(`[org-skill] share of '${slug}' failed: ${err}`),
        )
        .finally(() => inFlight.delete(key));
    },
    [advertised, workspaceId, agent.folderPath, queryClient, addToast, t],
  );
}
