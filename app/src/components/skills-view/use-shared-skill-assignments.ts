import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { OptimisticPatch } from "../../lib/optimistic-write";
import { optimisticWrite } from "../../lib/optimistic-write";
import { throwFirstRefusal } from "../../lib/settled-refusal";
import {
  copiesRemoved,
  manifestsSet,
  skillWriteRefresh,
} from "../../lib/skill-optimistic";
import { tauriSkillsManifest } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import { useUIStore } from "../../stores/ui";

interface Assignment {
  command: string;
  agentPaths: string[];
  patches: OptimisticPatch[];
  write: () => Promise<unknown>;
  failure: "add" | "update";
  notice: string;
}

export function useSharedSkillAssignments(workspaceId: string | null) {
  const { t } = useTranslation("skills");
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const assign = useCallback(
    (a: Assignment) => {
      void optimisticWrite({
        qc,
        command: a.command,
        patches: a.patches,
        write: a.write,
        failure: {
          title: t(`global.failure.${a.failure}Title`),
          description: t(`global.failure.${a.failure}Body`),
        },
        invalidate: skillWriteRefresh(a.agentPaths, workspaceId),
        onSuccess: () => addToast({ title: a.notice, variant: "success" }),
      });
    },
    [addToast, qc, t, workspaceId],
  );

  const enableForAll = useCallback(
    async (row: SharedSkillRow, agents: Agent[]): Promise<void> => {
      const paths = agents.map((agent) => agent.folderPath);
      assign({
        command: "skill_enable_for_all",
        agentPaths: paths,
        patches: manifestsSet(paths, row.slug, true),
        write: async () => {
          const settled = await Promise.allSettled(
            paths.map((path) =>
              tauriSkillsManifest.setEnabled(path, row.slug, true),
            ),
          );
          throwFirstRefusal(settled);
        },
        failure: "update",
        notice: t("global.enabledForAll", { count: agents.length }),
      });
    },
    [assign, t],
  );

  const addToAgent = useCallback(
    async (row: SharedSkillRow, agent: Agent, notice: string) => {
      assign({
        command: "skill_add_existing",
        agentPaths: [agent.folderPath],
        patches: manifestsSet([agent.folderPath], row.slug, true),
        write: async () =>
          tauriSkillsManifest.setEnabled(agent.folderPath, row.slug, true),
        failure: "add",
        notice,
      });
    },
    [assign],
  );

  const disableForAgent = useCallback(
    async (row: SharedSkillRow, agent: Agent): Promise<void> => {
      const paths = [agent.folderPath];
      assign({
        command: "skill_disable_for_agent",
        agentPaths: paths,
        patches: [
          ...manifestsSet(paths, row.slug, false),
          ...copiesRemoved(paths, row.slug),
        ],
        write: async () =>
          tauriSkillsManifest.disableForAgent(agent.folderPath, row.slug),
        failure: "update",
        notice: t("global.disabledForAgent", { name: agent.name }),
      });
    },
    [assign, t],
  );

  const revertOverride = useCallback(
    async (row: SharedSkillRow, agent: Agent): Promise<void> => {
      const paths = [agent.folderPath];
      assign({
        command: "skill_revert_override",
        agentPaths: paths,
        patches: [
          ...manifestsSet(paths, row.slug, true),
          ...copiesRemoved(paths, row.slug),
        ],
        write: async () =>
          tauriSkillsManifest.revertOverride(agent.folderPath, row.slug),
        failure: "update",
        notice: t("global.overrideReverted", { name: agent.name }),
      });
    },
    [assign, t],
  );

  return { enableForAll, addToAgent, disableForAgent, revertOverride };
}
