import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getEngine, newEngineActive } from "../lib/engine";
import { logAndReportError } from "../lib/error-report";
import { showErrorToast } from "../lib/error-toast";
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
import { tauriOrg } from "../lib/tauri";
import { teamMovePostscriptWire } from "../lib/team-move-postscript-wire";
import { drivePendingTeamMove } from "../lib/team-move-resume";
import { runTeamMovePostscript } from "../lib/team-move-stage";
import { useUIStore } from "../stores/ui";

export function useTeamMoveResume(enabled: boolean): void {
  const { t } = useTranslation("teams");
  const ran = useRef(false);
  useEffect(() => {
    if (!enabled || !newEngineActive() || ran.current) return;
    const pendingTeams = readPendingTeamMoves(undefined, reportPendingMove);
    if (pendingTeams.length === 0) return;
    ran.current = true;
    let cancelled = false;
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
                    ...(readPendingTeamMoves(undefined, reportPendingMove).find(
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
              runPostscript: () =>
                driveTeamMovePostscript(pending, () => {}, {
                  suppressToasts: () => true,
                }),
            });
            if (result.outcome === "done") {
              useUIStore.getState().addToast({
                title: t("moveTeamResume.done", {
                  team: pending.sourceTeam.name,
                }),
                variant: "success",
              });
            } else {
              useUIStore.getState().addToast({
                title: t("moveTeamResume.failed", {
                  team: pending.sourceTeam.name,
                }),
                variant: "error",
              });
            }
          } catch (error) {
            showErrorToast("resume_team_move", String(error), error);
            useUIStore.getState().addToast({
              title: t("moveTeamResume.failed", {
                team: pending.sourceTeam.name,
              }),
              variant: "error",
            });
          } finally {
            releaseTeamMove(pending.sourceTeam.id);
          }
        }
      } catch (error) {
        showErrorToast("resume_team_move", String(error), error);
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
  options: { suppressToasts?: () => boolean } = {},
): Promise<void> {
  try {
    await runTeamMovePostscript(pending, teamMovePostscriptWire(), (state) => {
      const stage = postscriptStage(state);
      if (stage)
        updatePendingTeamMove(pending.sourceTeam.id, {
          postscriptStage: stage,
        });
      onProgress(state);
    });
    clearPendingTeamMove(pending.sourceTeam.id);
    if (!options.suppressToasts?.())
      toastPostscript("done", pending.sourceTeam.name);
  } catch (error) {
    if (!options.suppressToasts?.())
      toastPostscript("failed", pending.sourceTeam.name);
    throw error;
  } finally {
    releaseTeamMove(pending.sourceTeam.id);
  }
}

function postscriptStage(state: TeamMoveState): TeamMoveStage | undefined {
  return ["createTarget", "cleanupSource", "switching"].includes(state.step)
    ? (state.step as TeamMoveStage)
    : undefined;
}

function reportPendingMove(error: unknown): void {
  logAndReportError("read_pending_team_moves", error);
}

function toastPostscript(kind: "done" | "failed", team: string): void {
  useUIStore.getState().addToast({
    title: i18n.t(`teams:moveTeamResume.${kind}`, { team }),
    variant: kind === "done" ? "success" : "error",
  });
}
