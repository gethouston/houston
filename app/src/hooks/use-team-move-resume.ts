import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getEngine, newEngineActive } from "../lib/engine";
import { readPendingMoves } from "../lib/pending-move";
import {
  claimTeamMove,
  clearPendingTeamMove,
  readPendingTeamMoves,
  releaseTeamMove,
  updatePendingTeamMove,
} from "../lib/pending-team-move";
import { shareErrorCode } from "../lib/share-via-team";
import { orgSlugFromWorkspaceId } from "../lib/space-id";
import { tauriAgentTeams } from "../lib/tauri";
import {
  completeTeamMovePostscript,
  teamMoveAgentsSettled,
} from "../lib/team-move-resume";
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
    void (async () => {
      const caps = await getEngine().capabilities();
      if (!caps.spaces) return;
      for (const pending of pendingTeams) {
        while (
          !cancelled &&
          !teamMoveAgentsSettled(
            pending,
            readPendingMoves().map((move) => move.agentId),
          )
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
        }
        if (cancelled || !claimTeamMove(pending.sourceTeam.id)) continue;
        try {
          await completeTeamMovePostscript(
            pending,
            {
              deleteSource: (id) => tauriAgentTeams.remove(id),
              switchTarget: async (slug) => {
                await useWorkspaceStore.getState().loadWorkspaces();
                const workspace = useWorkspaceStore
                  .getState()
                  .workspaces.find(
                    (item) => orgSlugFromWorkspaceId(item.id) === slug,
                  );
                if (!workspace) throw new Error("target workspace not found");
                useWorkspaceStore.getState().setCurrent(workspace);
                await useAgentStore.getState().loadAgents(workspace.id);
              },
              listTargetTeams: () => tauriAgentTeams.list(),
              createTargetTeam: (input) => tauriAgentTeams.create(input),
              updateTargetTeam: (id, patch) =>
                tauriAgentTeams.update(id, patch),
              placeAgent: (agentId, teamId) =>
                tauriAgentTeams.setAgentTeam(agentId, teamId),
            },
            {
              isMissingSource: (error) =>
                shareErrorCode(error) === "team_not_found",
              onTeamCreated: (id) =>
                updatePendingTeamMove(pending.sourceTeam.id, {
                  createdTeamId: id,
                }),
            },
          );
          clearPendingTeamMove(pending.sourceTeam.id);
          useUIStore.getState().addToast({
            title: t("moveTeamResume.done", { team: pending.sourceTeam.name }),
            variant: "success",
          });
        } catch {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, t]);
}
