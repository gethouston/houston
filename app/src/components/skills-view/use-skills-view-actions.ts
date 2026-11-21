import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { optimisticWrite } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { throwFirstRefusal } from "../../lib/settled-refusal";
import { copiesRemoved, skillWriteRefresh } from "../../lib/skill-optimistic";
import { tauriAgent, tauriSkills } from "../../lib/tauri";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { useUIStore } from "../../stores/ui";

const skillMdPath = (slug: string) => `.agents/skills/${slug}/SKILL.md`;

export function useSkillsViewActions() {
  const { t } = useTranslation("skills");
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const invalidateSkills = useCallback(
    (paths: string[]) => {
      for (const path of paths) {
        qc.invalidateQueries({ queryKey: queryKeys.skills(path) });
        qc.invalidateQueries({ queryKey: ["skill-detail", path] });
      }
    },
    [qc],
  );

  const applySkillChanges = useCallback(
    async (
      row: WorkspaceSkillRow,
      args: { content: string; contentDirty: boolean },
      plan: { writes: string[]; deletes: string[] },
    ): Promise<void> => {
      const settled = await Promise.allSettled([
        ...plan.writes.map((path) =>
          tauriAgent.writeFile(path, skillMdPath(row.slug), args.content),
        ),
        ...plan.deletes.map((path) => tauriSkills.delete(path, row.slug)),
      ]);
      invalidateSkills([...plan.writes, ...plan.deletes]);
      if (args.contentDirty)
        analytics.track("skill_edited", { skill_slug: row.slug });
      if (settled.some((r) => r.status === "rejected"))
        throw new Error("skill update failed for some agents");
      addToast({ title: t("global.skillUpdated"), variant: "success" });
    },
    [addToast, invalidateSkills, t],
  );

  const deleteSkillEverywhere = useCallback(
    async (row: WorkspaceSkillRow): Promise<void> => {
      const paths = row.agents.map((a) => a.folderPath);
      void optimisticWrite({
        qc,
        command: "skill_delete",
        patches: copiesRemoved(paths, row.slug),
        write: async () => {
          const settled = await Promise.allSettled(
            paths.map((path) => tauriSkills.delete(path, row.slug)),
          );
          throwFirstRefusal(settled);
        },
        failure: {
          title: t("global.failure.removeTitle"),
          description: t("global.failure.removeBody"),
        },
        invalidate: skillWriteRefresh(paths, null),
        onSuccess: () => {
          analytics.track("skill_deleted", { skill_slug: row.slug });
          addToast({ title: t("global.skillRemoved"), variant: "success" });
        },
      });
    },
    [addToast, qc, t],
  );

  return {
    applySkillChanges,
    deleteSkillEverywhere,
  };
}
