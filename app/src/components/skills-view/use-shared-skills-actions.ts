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
import { actThenRefresh } from "./skill-act-refresh";

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

  // One entry at a time, through the SDK: the manifest route replaces the
  // whole list, and the SDK is where that read-modify-write is serialized per
  // agent so two writes started together cannot drop each other.
  const setManifestEntry = useCallback(
    async (path: string, slug: string, enabled: boolean) => {
      await tauriSkillsManifest.setEnabled(path, slug, enabled);
    },
    [],
  );

  /** One save: content (when edited) is a single store write; assignment is
   *  manifest toggles. Nothing here can clobber an agent's override. */
  const applyShared = useCallback(
    async (
      row: SharedSkillRow,
      args: { content: string; contentDirty: boolean },
      plan: { enable: string[]; disable: string[] },
      notice: string = t("global.skillUpdated"),
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
      addToast({ title: notice, variant: "success" });
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

  /** "Share to workspace": the explicit act that replaced auto-migration. The
   *  canonical copy (first holder's) moves into the store, current holders get
   *  manifest entries, and only their BYTE-IDENTICAL copies are deleted — a
   *  holder whose copy diverged keeps it, surfacing as an override. */
  const promoteToShared = useCallback(
    async (row: SharedSkillRow): Promise<void> => {
      if (workspaceId === null) throw new Error("no workspace");
      const canonical = row.agents[0];
      if (!canonical) throw new Error("no holder to promote from");
      const detail = await tauriSkills.load(canonical.folderPath, row.slug);
      await tauriSharedSkills.promote(workspaceId, row.slug, detail.content);
      const settled = await Promise.allSettled(
        row.agents.map(async (holder) => {
          await setManifestEntry(holder.folderPath, row.slug, true);
          const copy = await tauriSkills.load(holder.folderPath, row.slug);
          if (copy.content === detail.content)
            await tauriSkills.delete(holder.folderPath, row.slug);
        }),
      );
      invalidate(row.agents.map((a) => a.folderPath));
      analytics.track("skill_installed", {
        skill_slug: row.slug,
        source: "promoted",
      });
      addToast({ title: t("global.promoted"), variant: "success" });
      if (settled.some((r) => r.status === "rejected"))
        throw new Error("promote failed for some agents");
    },
    [addToast, invalidate, setManifestEntry, t, workspaceId],
  );

  /**
   * "Disable for this AI Employee": the manifest entry off and the agent's own
   * shadowing copy dropped. A local copy loads whether or not the manifest
   * names it, so the two only mean anything together — which is why the order
   * lives in the SDK and this is a delegate.
   */
  const disableForAgent = useCallback(
    async (row: SharedSkillRow, agent: Agent): Promise<void> => {
      await actThenRefresh(
        () => tauriSkillsManifest.disableForAgent(agent.folderPath, row.slug),
        () => invalidate([agent.folderPath]),
      );
      addToast({
        title: t("global.disabledForAgent", { name: agent.name }),
        variant: "success",
      });
    },
    [addToast, invalidate, t],
  );

  /** Back on the store version: the manifest entry switched on, then the
   *  agent's overriding copy dropped. Deleting the copy first would leave the
   *  agent with neither version, which is why the order is the SDK's. */
  const revertOverride = useCallback(
    async (row: SharedSkillRow, agent: Agent): Promise<void> => {
      await actThenRefresh(
        () => tauriSkillsManifest.revertOverride(agent.folderPath, row.slug),
        () => invalidate([agent.folderPath]),
      );
      addToast({
        title: t("global.overrideReverted", { name: agent.name }),
        variant: "success",
      });
    },
    [addToast, invalidate, t],
  );

  return {
    applyShared,
    enableForAll,
    deleteShared,
    promoteToShared,
    revertOverride,
    disableForAgent,
  };
}
