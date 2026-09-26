import { useEffect, useRef, useState } from "react";
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
import {
  claimTeamMove,
  readPendingTeamMoves,
  recordPendingTeamMove,
  updatePendingTeamMove,
} from "../lib/pending-team-move";
import { classifyMoveError } from "../lib/share-via-team";
import { moveTeamAgent } from "../lib/team-agent-move";
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
  // The space switch can unmount the dialog before the move completes.
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
      if (
        !readPendingTeamMoves(undefined, reportPendingMove).some(
          (item) => item.sourceTeam.id === source.id,
        )
      )
        setState(initialTeamMoveState());
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
        result = await moveTeamAgent(agent, target);
      } catch (error) {
        showErrorToast("move_team_agent", String(error), error);
        setState((current) => teamAgentMoveFailed(current, "unknown"));
        return;
      }
      if (result.outcome !== "done") {
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
      showErrorToast("move_team_folder", String(error), error);
      setState(teamPostscriptFailed);
    } finally {
      ownsClaim.current = false;
    }
  };

  /** The postscript-failure face's Retry: show the resumed busy stage AND
   *  re-drive. The durable record carries `postscriptStage`, so the driver
   *  picks up exactly where the failure left it; a state change alone would
   *  leave the dialog on a busy face nothing is behind. */
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
