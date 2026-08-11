import { useEffect, useState } from "react";
import { resumePendingMove } from "../lib/move-resume";
import {
  agentMoveDone,
  confirmTeamMove,
  initialTeamMoveState,
  retryTeamMove,
  startTeamAgents,
  type TeamMoveSource,
  type TeamMoveState,
  teamAgentMoveFailed,
  teamPostscriptFailed,
} from "../lib/move-team";
import {
  claimMove,
  clearPendingMove,
  recordPendingMove,
  releaseMove,
  updatePendingMoveId,
} from "../lib/pending-move";
import {
  claimTeamMove,
  clearPendingTeamMove,
  recordPendingTeamMove,
  releaseTeamMove,
  updatePendingTeamMove,
} from "../lib/pending-team-move";
import {
  classifyMoveError,
  MOVE_POLL_TIMEOUT_MS,
  shareErrorCode,
} from "../lib/share-via-team";
import { orgSlugFromWorkspaceId } from "../lib/space-id";
import { tauriAgentTeams, tauriOrg } from "../lib/tauri";
import { runTeamMoveStage } from "../lib/team-move-stage";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAddMember, useOrgs } from "./queries";
import { useCreateTeam } from "./queries/use-orgs";

export function useTeamMoveFlow(source: TeamMoveSource, open: boolean) {
  const [state, setState] = useState<TeamMoveState>(initialTeamMoveState);
  const orgs = useOrgs(open);
  const createOrg = useCreateTeam();
  const addMember = useAddMember();

  useEffect(() => {
    if (!open) {
      setState(initialTeamMoveState());
      releaseTeamMove(source.id);
    }
    return () => releaseTeamMove(source.id);
  }, [open, source.id]);

  const switchTarget = async (slug: string) => {
    await useWorkspaceStore.getState().loadWorkspaces();
    const ws = useWorkspaceStore
      .getState()
      .workspaces.find((item) => orgSlugFromWorkspaceId(item.id) === slug);
    if (!ws) throw new Error("target workspace not found");
    useWorkspaceStore.getState().setCurrent(ws);
    await useAgentStore.getState().loadAgents(ws.id);
  };

  const postscriptWire = {
    deleteSource: (id: string) => tauriAgentTeams.remove(id),
    switchTarget,
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
  };

  const moveAgents = async () => {
    const target = "target" in state ? state.target : null;
    const startIndex = state.step === "moveFailed" ? state.index : 0;
    if (!target || (state.step !== "moveFailed" && !claimTeamMove(source.id)))
      return;
    recordPendingTeamMove({
      sourceTeam: {
        id: source.id,
        name: source.name,
        ...(source.icon ? { icon: source.icon } : {}),
        ...(source.color ? { color: source.color } : {}),
        ...(source.context ? { context: source.context } : {}),
        isDefault: source.isDefault,
      },
      targetSlug: target.slug,
      targetName: target.name,
      agentIds: source.agents.map((agent) => agent.id),
      startedAt: Date.now(),
    });
    setState(startTeamAgents);
    if (source.agents.length === 0) {
      setState({
        step: source.isDefault ? "switching" : "cleanupSource",
        target,
      });
      return;
    }
    for (let index = startIndex; index < source.agents.length; index += 1) {
      const agent = source.agents[index];
      setState({ step: "movingAgents", target, index });
      recordPendingMove({
        agentId: agent.id,
        agentName: agent.name,
        teamSlug: target.slug,
        teamName: target.name,
        moveId: "",
        startedAt: Date.now(),
      });
      claimMove(agent.id);
      const pending = {
        agentId: agent.id,
        agentName: agent.name,
        teamSlug: target.slug,
        teamName: target.name,
        moveId: "",
        startedAt: Date.now(),
      };
      let result = await resumePendingMove(pending, {
        moveAgent: (id, to) => tauriOrg.moveAgent(id, to, { toast: false }),
        moveStatus: (id, moveId) =>
          tauriOrg.moveStatus(id, moveId, { toast: false }),
      });
      const deadline = Date.now() + MOVE_POLL_TIMEOUT_MS;
      while (result.outcome === "inProgress" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        result = await resumePendingMove(pending, {
          moveAgent: (id, to) => tauriOrg.moveAgent(id, to, { toast: false }),
          moveStatus: (id, moveId) =>
            tauriOrg.moveStatus(id, moveId, { toast: false }),
        });
      }
      releaseMove(agent.id);
      if (result.outcome !== "done") {
        if ("moveId" in result && result.moveId)
          updatePendingMoveId(agent.id, result.moveId);
        setState((current) =>
          teamAgentMoveFailed(
            current,
            classifyMoveError(
              "code" in result
                ? result.code
                : "error" in result
                  ? result.error
                  : result.outcome,
            ),
          ),
        );
        return;
      }
      clearPendingMove(agent.id);
      setState((current) => agentMoveDone(current, source));
    }
  };

  const runPostscript = async () => {
    if (!("target" in state)) return;
    try {
      const result = await runTeamMoveStage(state, source, {
        ...postscriptWire,
        isMissingSource: (error) => shareErrorCode(error) === "team_not_found",
      });
      if (result.createdTeamId) {
        updatePendingTeamMove(source.id, {
          createdTeamId: result.createdTeamId,
        });
      }
      setState(result.state);
    } catch {
      setState(teamPostscriptFailed);
    }
  };

  return {
    state,
    setState,
    orgs,
    createOrg,
    addMember,
    moveAgents,
    runPostscript,
    confirmTeamMove,
    retryTeamMove,
    clearTeamRecord: () => clearPendingTeamMove(source.id),
  };
}
