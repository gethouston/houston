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
  readPendingTeamMoves,
  recordPendingTeamMove,
  releaseTeamMove,
  updatePendingTeamMove,
} from "../lib/pending-team-move";
import { classifyMoveError, MOVE_POLL_TIMEOUT_MS } from "../lib/share-via-team";
import { tauriOrg } from "../lib/tauri";
import { useAddMember, useOrgs } from "./queries";
import { useCreateTeam } from "./queries/use-orgs";
import { driveTeamMovePostscript } from "./use-team-move-resume";

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
  }, [open, source.id]);

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
      movedAgentIds: source.agents
        .slice(0, startIndex)
        .map((agent) => agent.id),
      startedAt: Date.now(),
    });
    setState(startTeamAgents);
    if (source.agents.length === 0) {
      setState({
        step: source.isDefault ? "switching" : "cleanupSource",
        target,
      });
      void runPostscript(target);
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
      let pending = {
        agentId: agent.id,
        agentName: agent.name,
        teamSlug: target.slug,
        teamName: target.name,
        moveId: "",
        startedAt: Date.now(),
      };
      let result = await resumePendingMove(pending, {
        moveAgent: async (id, to) => {
          const start = await tauriOrg.moveAgent(id, to, { toast: false });
          updatePendingMoveId(id, start.moveId);
          pending = { ...pending, moveId: start.moveId };
          return start;
        },
        moveStatus: (id, moveId) =>
          tauriOrg.moveStatus(id, moveId, { toast: false }),
      });
      const deadline = Date.now() + MOVE_POLL_TIMEOUT_MS;
      while (result.outcome === "inProgress" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        result = await resumePendingMove(pending, {
          moveAgent: async (id, to) => {
            const start = await tauriOrg.moveAgent(id, to, { toast: false });
            updatePendingMoveId(id, start.moveId);
            pending = { ...pending, moveId: start.moveId };
            return start;
          },
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
      updatePendingTeamMove(source.id, {
        movedAgentIds: source.agents.slice(0, index + 1).map((item) => item.id),
      });
      setState((current) => agentMoveDone(current, source));
    }
    void runPostscript(target);
  };

  const runPostscript = async (
    target = "target" in state ? state.target : null,
  ) => {
    if (!target) return;
    const pending = readPendingTeamMoves().find(
      (item) => item.sourceTeam.id === source.id,
    );
    if (!pending) return;
    try {
      await driveTeamMovePostscript(pending, setState);
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
    confirmTeamMove,
    retryTeamMove,
  };
}
