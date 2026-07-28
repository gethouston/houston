import type { CommunitySkill } from "@houston-ai/skills";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import type { HoustonLibrarySkill } from "../../lib/houston-skill-library";
import {
  humanizeSkillName,
  skillDisplayTitle,
} from "../../lib/humanize-skill-name";
import type { Agent } from "../../lib/types";
import { InstallSkillDialog } from "./install-skill-dialog";
import type { useSkillsViewActions } from "./use-skills-view-actions";

/** An install parked behind the pick-agents dialog. */
type PendingInstall =
  | {
      kind: "community";
      skill: CommunitySkill;
      resolve: (slug: string) => void;
      reject: (err: unknown) => void;
    }
  | { kind: "library"; skill: HoustonLibrarySkill };

/**
 * The global page's one pick-agents install flow (HOU-792): both install
 * sources — a skills.sh marketplace card and a Houston-library row — park
 * their click here, the shared dialog chooses the agents, and the matching
 * fan-out runs. The marketplace card hands its click over as a promise
 * (settled with the fan-out's outcome; a cancel rejects quietly so the card
 * just re-enables), the library row via a busy-slug it can spin on.
 */
export function useGlobalInstallFlow(opts: {
  agents: Agent[];
  hasSkill: (agent: Agent, slug: string) => boolean;
  actions: ReturnType<typeof useSkillsViewActions>;
}): {
  dialogNode: ReactNode;
  handleInstallCommunity: (skill: CommunitySkill) => Promise<string>;
  handleInstallLibrary: (skill: HoustonLibrarySkill) => void;
  /** The library slug currently picking/fanning out (its row spins). */
  libraryInstalling: string | null;
} {
  const { agents, hasSkill, actions } = opts;
  const [pending, setPending] = useState<PendingInstall | null>(null);
  const [libraryBusy, setLibraryBusy] = useState<string | null>(null);

  const handleInstallCommunity = useCallback(
    (skill: CommunitySkill) =>
      new Promise<string>((resolve, reject) => {
        setPending({ kind: "community", skill, resolve, reject });
      }),
    [],
  );

  const handleInstallLibrary = useCallback((skill: HoustonLibrarySkill) => {
    setLibraryBusy(skill.slug);
    setPending({ kind: "library", skill });
  }, []);

  const settle = useCallback(() => {
    setPending(null);
    setLibraryBusy(null);
  }, []);

  const target = pending
    ? pending.kind === "community"
      ? {
          slug: pending.skill.skillId,
          name: humanizeSkillName(pending.skill.skillId),
        }
      : {
          slug: pending.skill.slug,
          name: skillDisplayTitle({
            name: pending.skill.slug,
            title: pending.skill.title,
          }),
        }
    : null;

  const dialogNode = (
    <InstallSkillDialog
      target={target}
      agents={agents}
      hasSkill={hasSkill}
      onConfirm={async (targets) => {
        const p = pending;
        if (!p) return;
        try {
          if (p.kind === "community")
            p.resolve(await actions.installToAgents(p.skill, targets));
          else await actions.installLibraryToAgents(p.skill, targets);
        } catch (err) {
          // Failure toasts already fired inside the fan-out; a community
          // rejection only re-enables the marketplace card.
          if (p.kind === "community") p.reject(err);
        }
        settle();
      }}
      onCancel={() => {
        if (pending?.kind === "community")
          pending.reject(new Error("install canceled"));
        settle();
      }}
    />
  );

  return {
    dialogNode,
    handleInstallCommunity,
    handleInstallLibrary,
    libraryInstalling: libraryBusy,
  };
}
