import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { queryKeys } from "../../lib/query-keys";
import {
  tauriSharedSkills,
  tauriSkills,
  tauriSkillsManifest,
} from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import { useUIStore } from "../../stores/ui";

/**
 * Store-backed actions for the global Skills page (ADR 0003): content is ONE
 * write to the workspace store, assignment is per-agent manifest toggles
 * (reversible — no copies move), and an agent's divergent copy is an override
 * the row can revert. Write failures toast their real reason through the
 * `call` wrapper; these callbacks re-throw so dialogs stay open.
 */
export function useSharedSkillsActions(workspaceId: string | null) {
  const { t } = useTranslation("skills");
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const invalidate = useCallback(
    (agentPaths: string[]) => {
      if (workspaceId !== null)
        qc.invalidateQueries({
          queryKey: queryKeys.sharedSkills(workspaceId),
        });
      for (const path of agentPaths) {
        qc.invalidateQueries({ queryKey: queryKeys.skillsManifest(path) });
        qc.invalidateQueries({ queryKey: queryKeys.skills(path) });
        qc.invalidateQueries({ queryKey: ["skill-detail", path] });
      }
    },
    [qc, workspaceId],
  );

  const setManifestEntry = useCallback(
    async (path: string, slug: string, enabled: boolean) => {
      const manifest = await tauriSkillsManifest.get(path);
      const set = new Set(manifest.enabled);
      if (enabled) set.add(slug);
      else set.delete(slug);
      await tauriSkillsManifest.set(path, {
        version: 1,
        enabled: [...set].sort(),
      });
    },
    [],
  );

  /** From-scratch create lands in the store, then enables the picked agents. */
  const createShared = useCallback(
    async (
      input: { name: string; description: string; content: string },
      targets: Agent[],
    ): Promise<void> => {
      if (workspaceId === null) throw new Error("no workspace");
      const detail = await tauriSharedSkills.create(workspaceId, input);
      const settled = await Promise.allSettled(
        targets.map((agent) =>
          setManifestEntry(agent.folderPath, detail.name, true),
        ),
      );
      invalidate(targets.map((a) => a.folderPath));
      analytics.track("skill_installed", {
        skill_slug: detail.name,
        source: "scratch",
      });
      addToast({
        title: t("global.createdShared"),
        variant: "success",
      });
      if (settled.some((r) => r.status === "rejected"))
        throw new Error("enable failed for some agents");
    },
    [addToast, invalidate, setManifestEntry, t, workspaceId],
  );

  /** One save: content (when edited) is a single store write; assignment is
   *  manifest toggles. Nothing here can clobber an agent's override. */
  const applyShared = useCallback(
    async (
      row: SharedSkillRow,
      args: { content: string; contentDirty: boolean },
      plan: { enable: string[]; disable: string[] },
    ): Promise<void> => {
      if (workspaceId === null) throw new Error("no workspace");
      if (args.contentDirty) {
        await tauriSharedSkills.save(workspaceId, row.slug, args.content);
        analytics.track("skill_edited", { skill_slug: row.slug });
      }
      const settled = await Promise.allSettled([
        ...plan.enable.map((path) => setManifestEntry(path, row.slug, true)),
        ...plan.disable.map((path) => setManifestEntry(path, row.slug, false)),
      ]);
      invalidate([...plan.enable, ...plan.disable]);
      if (settled.some((r) => r.status === "rejected"))
        throw new Error("skill update failed for some agents");
      addToast({ title: t("global.skillUpdated"), variant: "success" });
    },
    [addToast, invalidate, setManifestEntry, t, workspaceId],
  );

  /** Enable a store skill for every agent — N explicit manifest writes. */
  const enableForAll = useCallback(
    async (row: SharedSkillRow, agents: Agent[]): Promise<void> => {
      const settled = await Promise.allSettled(
        agents.map((agent) =>
          setManifestEntry(agent.folderPath, row.slug, true),
        ),
      );
      invalidate(agents.map((a) => a.folderPath));
      if (settled.some((r) => r.status === "rejected"))
        throw new Error("enable failed for some agents");
      addToast({
        title: t("global.enabledForAll", { count: agents.length }),
        variant: "success",
      });
    },
    [addToast, invalidate, setManifestEntry, t],
  );

  /** Delete the store copy; agents' modified copies stay as their own skills. */
  const deleteShared = useCallback(
    async (row: SharedSkillRow, agents: Agent[]): Promise<void> => {
      if (workspaceId === null) throw new Error("no workspace");
      await tauriSharedSkills.delete(workspaceId, row.slug);
      const holders = agents.map((a) => a.folderPath);
      await Promise.allSettled(
        holders.map((path) => setManifestEntry(path, row.slug, false)),
      );
      invalidate(holders);
      analytics.track("skill_deleted", { skill_slug: row.slug });
      addToast({ title: t("global.skillRemoved"), variant: "success" });
    },
    [addToast, invalidate, setManifestEntry, t, workspaceId],
  );

  /** Drop an agent's overriding copy — back on the store version. */
  const revertOverride = useCallback(
    async (row: SharedSkillRow, agent: Agent): Promise<void> => {
      await tauriSkills.delete(agent.folderPath, row.slug);
      invalidate([agent.folderPath]);
      addToast({
        title: t("global.overrideReverted", { name: agent.name }),
        variant: "success",
      });
    },
    [addToast, invalidate, t],
  );

  return {
    createShared,
    applyShared,
    enableForAll,
    deleteShared,
    revertOverride,
  };
}
