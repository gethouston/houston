import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getEngine, newEngineActive } from "../lib/engine";
import i18n from "../lib/i18n";
import { resumePendingMove } from "../lib/move-resume";
import type { TeamMoveStage, TeamMoveState } from "../lib/move-team";
import {
  clearPendingMove,
  readPendingMoves,
  recordPendingMove,
  updatePendingMoveId,
} from "../lib/pending-move";
import {
  claimTeamMove,
  clearPendingTeamMove,
  type PendingTeamMove,
  readPendingTeamMoves,
  releaseTeamMove,
  updatePendingTeamMove,
} from "../lib/pending-team-move";
import { shareErrorCode } from "../lib/share-via-team";
import { orgSlugFromWorkspaceId } from "../lib/space-id";
import { tauriAgentTeams, tauriOrg } from "../lib/tauri";
import { drivePendingTeamMove } from "../lib/team-move-resume";
import { runTeamMovePostscript } from "../lib/team-move-stage";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";

export function useTeamMoveResume(enabled: boolean): void {
  const { t } = useTranslation("teams");
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || !newEngineActive() || ran.current) return;
    const pendingTeams = readPendingTeamMoves();
    if (pendingTeams.length === 0) return;
    ran.current = true;
    let cancelled = false;
    const toast = (kind: "done" | "failed", team: string) => {
      useUIStore.getState().addToast({
        title: t(`moveTeamResume.${kind}`, { team }),
        variant: kind === "done" ? "success" : "error",
      });
    };
    void (async () => {
      try {
        const caps = await getEngine().capabilities();
        if (!caps.spaces) return;
        for (const pending of pendingTeams) {
          if (cancelled || !claimTeamMove(pending.sourceTeam.id)) continue;
          try {
            const result = await drivePendingTeamMove(pending, {
              readAgentMove: (id) =>
                readPendingMoves().find((move) => move.agentId === id),
              recordAgentMove: recordPendingMove,
              updateAgentMoveId: updatePendingMoveId,
              clearAgentMove: clearPendingMove,
              markAgentMoved: (id) =>
                updatePendingTeamMove(pending.sourceTeam.id, {
                  movedAgentIds: [
                    ...(readPendingTeamMoves().find(
                      (item) => item.sourceTeam.id === pending.sourceTeam.id,
                    )?.movedAgentIds ?? []),
                    id,
                  ],
                }),
              resumeAgentMove: (move, options) =>
                resumePendingMove(
                  move,
                  {
                    moveAgent: (id, to) =>
                      tauriOrg.moveAgent(id, to, { toast: false }),
                    moveStatus: (id, moveId) =>
                      tauriOrg.moveStatus(id, moveId, { toast: false }),
                  },
                  options,
                ),
              runPostscript: () => driveTeamMovePostscript(pending),
            });
            if (result.outcome !== "done") throw new Error("agent move failed");
          } catch (error) {
            if (!(error instanceof TeamMovePostscriptError))
              toast("failed", pending.sourceTeam.name);
          } finally {
            releaseTeamMove(pending.sourceTeam.id);
          }
        }
      } catch {
        toast("failed", pendingTeams[0]?.sourceTeam.name ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, t]);
}

export async function driveTeamMovePostscript(
  pending: PendingTeamMove,
  onProgress: (state: TeamMoveState) => void = () => {},
  options: {
    /** Asked AT COMPLETION time: a MOUNTED dialog renders the same outcome
     *  inline (invite step / failure face), so the driver's toast would be a
     *  second surface for one event. Unmounted mid-drive (the space switch
     *  tears the view down), the toast is the only surface and fires. */
    suppressToasts?: () => boolean;
  } = {},
): Promise<void> {
  const toast = (kind: "done" | "failed") => {
    if (!options.suppressToasts?.()) {
      toastPostscript(kind, pending.sourceTeam.name);
    }
  };
  try {
    await runTeamMovePostscript(
      pending,
      postscriptWire(pending),
      (state, createdTeamId) => {
        const stage = postscriptStage(state);
        updatePendingTeamMove(pending.sourceTeam.id, {
          ...(createdTeamId ? { createdTeamId } : {}),
          ...(stage ? { postscriptStage: stage } : {}),
        });
        onProgress(state);
      },
    );
    clearPendingTeamMove(pending.sourceTeam.id);
    toast("done");
  } catch (error) {
    toast("failed");
    throw new TeamMovePostscriptError(error);
  } finally {
    releaseTeamMove(pending.sourceTeam.id);
  }
}

export class TeamMovePostscriptError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super("team move postscript failed");
    this.cause = cause;
  }
}

function postscriptStage(state: TeamMoveState): TeamMoveStage | undefined {
  return ["cleanupSource", "switching", "recreate", "placing"].includes(
    state.step,
  )
    ? (state.step as TeamMoveStage)
    : undefined;
}

function postscriptWire(pending: PendingTeamMove) {
  return {
    deleteSource: (id: string) => tauriAgentTeams.remove(id),
    switchTarget: switchTargetWorkspace,
    listTargetTeams: () => tauriAgentTeams.list(),
    createTargetTeam: (input: {
      name: string;
      icon?: string;
      color?: string;
    }) => tauriAgentTeams.create(input),
    updateTargetTeam: (id: string, patch: { context: string }) =>
      tauriAgentTeams.update(id, patch),
    placeAgent: (agentId: string, teamId: string) =>
      tauriAgentTeams.setAgentTeam(agentId, teamId),
    isMissingSource: (error: unknown) =>
      shareErrorCode(error) === "team_not_found",
    preferredTeamId: pending.createdTeamId,
  };
}

function toastPostscript(kind: "done" | "failed", team: string): void {
  useUIStore.getState().addToast({
    title: i18n.t(`teams:moveTeamResume.${kind}`, { team }),
    variant: kind === "done" ? "success" : "error",
  });
}

async function switchTargetWorkspace(slug: string): Promise<void> {
  await useWorkspaceStore.getState().loadWorkspaces();
  const workspace = useWorkspaceStore
    .getState()
    .workspaces.find((item) => orgSlugFromWorkspaceId(item.id) === slug);
  if (!workspace) throw new Error("target workspace not found");
  useWorkspaceStore.getState().setCurrent(workspace);
  await useAgentStore.getState().loadAgents(workspace.id);
}
