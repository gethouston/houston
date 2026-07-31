import type { CommunitySkill } from "@houston-ai/skills";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { humanizeSkillName } from "../../lib/humanize-skill-name";
import type { Agent } from "../../lib/types";
import { InstallSkillDialog } from "./install-skill-dialog";
import type { useSkillsViewActions } from "./use-skills-view-actions";

/** An install parked behind the pick-agents dialog. */
interface PendingInstall {
  skill: CommunitySkill;
  resolve: (slug: string) => void;
  reject: (err: unknown) => void;
}

/**
 * The global page's one pick-agents install flow (HOU-792): a skills.sh
 * marketplace card parks its click here as a promise, the shared dialog
 * chooses the agents, and the fan-out runs. The promise settles with the
 * fan-out's outcome; a cancel rejects quietly so the card just re-enables.
 */
export function useGlobalInstallFlow(opts: {
  agents: Agent[];
  hasSkill: (agent: Agent, slug: string) => boolean;
  actions: ReturnType<typeof useSkillsViewActions>;
}): {
  dialogNode: ReactNode;
  handleInstallCommunity: (skill: CommunitySkill) => Promise<string>;
} {
  const { agents, hasSkill, actions } = opts;
  const [pending, setPending] = useState<PendingInstall | null>(null);

  const handleInstallCommunity = useCallback(
    (skill: CommunitySkill) =>
      new Promise<string>((resolve, reject) => {
        setPending({ skill, resolve, reject });
      }),
    [],
  );

  const dialogNode = (
    <InstallSkillDialog
      target={
        pending
          ? {
              slug: pending.skill.skillId,
              name: humanizeSkillName(pending.skill.skillId),
            }
          : null
      }
      agents={agents}
      hasSkill={hasSkill}
      onConfirm={async (targets) => {
        const p = pending;
        if (!p) return;
        try {
          p.resolve(await actions.installToAgents(p.skill, targets));
        } catch (err) {
          // Failure toasts already fired inside the fan-out; the rejection
          // only re-enables the marketplace card.
          p.reject(err);
        }
        setPending(null);
      }}
      onCancel={() => {
        pending?.reject(new Error("install canceled"));
        setPending(null);
      }}
    />
  );

  return { dialogNode, handleInstallCommunity };
}
