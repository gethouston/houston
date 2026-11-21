import { useEffect, useRef, useState } from "react";
import { describeError } from "../lib/describe-error";
import { logAndReportError } from "../lib/error-report";
import { showErrorToast } from "../lib/error-toast";
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
import { moveWire } from "../lib/move-wire";
import {
  claimTeamMove,
  parkRefusedTeamMove,
  readPendingTeamMoves,
  recordPendingTeamMove,
  updatePendingTeamMove,
} from "../lib/pending-team-move";
import { moveTeamAgent, teamAgentMoveError } from "../lib/team-agent-move";
import {
  beginPostscriptRetry,
  releaseOwnedTeamMove,
} from "../lib/team-move-claim";
import { resumedTeamMove } from "../lib/team-move-resume";
import { useAddMember, useOrgs } from "./queries";
import { useCreateTeam } from "./queries/use-orgs";
import { driveTeamMovePostscript } from "./use-team-move-resume";

export function useTeamMoveFlow(source: TeamMoveSource, open: boolean) {
  const [state, setState] = useState<TeamMoveState>(initialTeamMoveState);
  const orgs = useOrgs(open);
  const createOrg = useCreateTeam();
  const addMember = useAddMember();
  const ownsClaim = useRef(false);
  const startedSource = useRef(source);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseOwnedTeamMove(source.id, ownsClaim);
    };
  }, [source.id]);

  useEffect(() => {
    if (!open) {
      releaseOwnedTeamMove(source.id, ownsClaim);
      const pending = readPendingTeamMoves(undefined, reportPendingMove).find(
        (item) => item.sourceTeam.id === source.id,
      );
      if (!pending || pending.refusedAgentId) setState(initialTeamMoveState());
    }
  }, [open, source.id]);

  useEffect(() => {
    if (!open || state.step !== "pick") return;
    const pending = readPendingTeamMoves(undefined, reportPendingMove).find(
      (item) => item.sourceTeam.id === source.id,
    );
    if (!pending) return;
    const resumed = resumedTeamMove(pending, source);
    startedSource.current = resumed.source;
    setState(resumed.state);
  }, [open, source, state.step]);

  const moveAgents = async () => {
    const target = "target" in state ? state.target : null;
    const startIndex = state.step === "moveFailed" ? state.index : 0;
    if (state.step !== "moveFailed") startedSource.current = source;
    const moving = startedSource.current;
    if (!target) return;
    if (!ownsClaim.current) {
      if (!claimTeamMove(source.id)) return;
      ownsClaim.current = true;
    }
    const existing = readPendingTeamMoves(undefined, reportPendingMove).find(
      (item) => item.sourceTeam.id === source.id,
    );
    recordPendingTeamMove({
      sourceTeam: {
        id: moving.id,
        name: moving.name,
        ...(moving.icon ? { icon: moving.icon } : {}),
        ...(moving.color ? { color: moving.color } : {}),
        workspaceId: moving.workspaceId,
      },
      targetSlug: target.slug,
      targetName: target.name,
      targetGroupId: existing?.targetGroupId ?? `grp_${crypto.randomUUID()}`,
      agentIds: moving.agents.map((agent) => agent.id),
      movedAgentIds: moving.agents
        .slice(0, startIndex)
        .map((agent) => agent.id),
      startedAt: Date.now(),
    });
    setState(startTeamAgents);
    if (moving.agents.length === 0) {
      setState({
        step: "createTarget",
        target,
      });
      void runPostscript(target);
      return;
    }
    for (let index = startIndex; index < moving.agents.length; index += 1) {
      const agent = moving.agents[index];
      setState({ step: "movingAgents", target, index });
      let result: Awaited<ReturnType<typeof moveTeamAgent>>;
      try {
        result = await moveTeamAgent(agent, target, moveWire);
      } catch (error) {
        showErrorToast("move_team_agent", describeError(error), error);
        setState((current) => teamAgentMoveFailed(current, "unknown"));
        return;
      }
      if (result.outcome !== "done" && result.outcome !== "gone") {
        if (result.outcome === "refused")
          parkRefusedTeamMove(source.id, agent.id);
        const error = teamAgentMoveError(result);
        setState((current) => teamAgentMoveFailed(current, error));
        return;
      }
      updatePendingTeamMove(source.id, {
        movedAgentIds: moving.agents.slice(0, index + 1).map((item) => item.id),
      });
      setState((current) => agentMoveDone(current, moving));
    }
    void runPostscript(target);
  };

  const runPostscript = async (
    target = "target" in state ? state.target : null,
  ) => {
    if (!target) return;
    const pending = readPendingTeamMoves(undefined, reportPendingMove).find(
      (item) => item.sourceTeam.id === source.id,
    );
    if (!pending) return;
    if (!ownsClaim.current) {
      if (!claimTeamMove(source.id)) return;
      ownsClaim.current = true;
    }
    try {
      await driveTeamMovePostscript(pending, setState, {
        suppressToasts: () => mounted.current,
      });
    } catch (error) {
      showErrorToast("move_team_folder", describeError(error), error);
      setState(teamPostscriptFailed);
    } finally {
      ownsClaim.current = false;
    }
  };

  const retryPostscript = () => {
    if (
      !beginPostscriptRetry(source.id, ownsClaim, () => setState(retryTeamMove))
    )
      return;
    void runPostscript();
  };

  return {
    movingSource: startedSource.current,
    state,
    setState,
    orgs,
    createOrg,
    addMember,
    moveAgents,
    retryPostscript,
    confirmTeamMove,
    retryTeamMove,
  };
}

function reportPendingMove(error: unknown): void {
  logAndReportError("read_pending_team_moves", error);
}
