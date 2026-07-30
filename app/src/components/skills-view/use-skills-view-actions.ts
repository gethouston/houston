import { type CommunitySkill, classifySkillError } from "@houston-ai/skills";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import {
  type HoustonLibrarySkill,
  withFeaturedFrontmatter,
} from "../../lib/houston-skill-library";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent, tauriSkills } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { useUIStore } from "../../stores/ui";

const skillMdPath = (slug: string) => `.agents/skills/${slug}/SKILL.md`;

/**
 * The global Skills page's fan-out actions (HOU-792): every operation is N
 * calls to the existing per-agent routes (skills are stored ON each agent —
 * there is no shared store, and the hosted gateway only proxies agent-scoped
 * routes). Failures surface per the no-silent-failures rule: the `call`
 * wrapper already toasts write/delete failures with the real reason; community
 * installs ride `toast: false`, so this hook toasts those itself, naming the
 * agents that failed.
 */
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

  /** skills.sh install, fanned out to the picked agents. Resolves the slug for
   *  the marketplace card's installed check; rejects if nothing installed. */
  const installToAgents = useCallback(
    async (skill: CommunitySkill, targets: Agent[]): Promise<string> => {
      const settled = await Promise.allSettled(
        targets.map((agent) =>
          tauriSkills.installCommunity(
            agent.folderPath,
            skill.source,
            skill.skillId,
          ),
        ),
      );
      invalidateSkills(targets.map((a) => a.folderPath));
      const failures = settled
        .map((r, i) => ({ r, agent: targets[i] }))
        .filter(({ r }) => r.status === "rejected");
      const okCount = settled.length - failures.length;
      if (okCount > 0) {
        analytics.track("skill_installed", {
          skill_slug: skill.skillId,
          source: "community",
        });
        addToast({
          title: t("global.installedTo", { count: okCount }),
          variant: "success",
        });
      }
      if (failures.length > 0) {
        const allAlready = failures.every(
          ({ r }) =>
            r.status === "rejected" &&
            classifySkillError(r.reason) === "already_installed",
        );
        if (allAlready && okCount === 0) {
          addToast({ title: t("store.installFailedAlready"), variant: "info" });
        } else if (!allAlready) {
          addToast({
            title: t("global.installFailedFor", {
              names: failures.map(({ agent }) => agent.name).join(", "),
            }),
            variant: "error",
          });
        }
      }
      if (okCount === 0) throw new Error("install failed for every agent");
      const first = settled.find((r) => r.status === "fulfilled");
      return first?.status === "fulfilled" ? first.value : skill.skillId;
    },
    [addToast, invalidateSkills, t],
  );

  /** From-scratch create, fanned out. Targets already holding the slug are the
   *  dialog's concern (it filters them); a real failure keeps the dialog open. */
  const createForAgents = useCallback(
    async (
      input: { name: string; description: string; content: string },
      targets: Agent[],
    ): Promise<void> => {
      const settled = await Promise.allSettled(
        targets.map((agent) =>
          tauriSkills.create(
            agent.folderPath,
            input.name,
            input.description,
            input.content,
          ),
        ),
      );
      invalidateSkills(targets.map((a) => a.folderPath));
      const okCount = settled.filter((r) => r.status === "fulfilled").length;
      if (okCount > 0) {
        analytics.track("skill_installed", {
          skill_slug: input.name,
          source: "scratch",
        });
        addToast({
          title: t("global.createdFor", { count: okCount }),
          variant: "success",
        });
      }
      // Failures already toasted with their real reason by the `call` wrapper.
      if (okCount === 0) throw new Error("create failed for every agent");
    },
    [addToast, invalidateSkills, t],
  );

  /** Houston-library install, fanned out to the picked agents — the same
   *  full-file copy the per-agent library uses, N times. */
  const installLibraryToAgents = useCallback(
    async (skill: HoustonLibrarySkill, targets: Agent[]): Promise<void> => {
      const settled = await Promise.allSettled(
        targets.map((agent) =>
          tauriAgent.writeFile(
            agent.folderPath,
            skillMdPath(skill.slug),
            withFeaturedFrontmatter(skill.content),
          ),
        ),
      );
      invalidateSkills(targets.map((a) => a.folderPath));
      const okCount = settled.filter((r) => r.status === "fulfilled").length;
      if (okCount > 0) {
        analytics.track("skill_installed", {
          skill_slug: skill.slug,
          source: "houston",
        });
        addToast({
          title: t("global.installedTo", { count: okCount }),
          variant: "success",
        });
      }
      // Failures already toasted with their real reason by `call`.
      if (okCount === 0) throw new Error("install failed for every agent");
    },
    [addToast, invalidateSkills, t],
  );

  /** One global save: write the canonical content to `writes`, remove the copy
   *  from `deletes` (both agent folderPaths). Throws if anything failed so the
   *  dialog stays open; the failed calls have already toasted their reason. */
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

  /** Remove the skill from every agent that holds it. */
  const deleteSkillEverywhere = useCallback(
    async (row: WorkspaceSkillRow): Promise<void> => {
      const paths = row.agents.map((a) => a.folderPath);
      const settled = await Promise.allSettled(
        paths.map((path) => tauriSkills.delete(path, row.slug)),
      );
      invalidateSkills(paths);
      analytics.track("skill_deleted", { skill_slug: row.slug });
      if (settled.some((r) => r.status === "rejected"))
        throw new Error("skill delete failed for some agents");
      addToast({ title: t("global.skillRemoved"), variant: "success" });
    },
    [addToast, invalidateSkills, t],
  );

  return {
    installToAgents,
    installLibraryToAgents,
    createForAgents,
    applySkillChanges,
    deleteSkillEverywhere,
  };
}
