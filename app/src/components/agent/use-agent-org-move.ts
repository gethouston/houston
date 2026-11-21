import { useEffect, useState } from "react";
import { useAgentMoveStatus, useMoveAgent, useOrgs } from "../../hooks/queries";
import {
  claimMove,
  clearPendingMove,
  recordPendingMove,
  releaseMove,
} from "../../lib/pending-move";
import { shareErrorCode } from "../../lib/share-error";
import {
  applyMovePoll,
  initialState,
  MOVE_POLL_TIMEOUT_MS,
  moveRejected,
  moveTimedOut,
  type ShareViaTeamState,
  startMove,
  switchDone,
  switchFailed,
  type TeamRef,
} from "../../lib/share-via-team";
import {
  orgSlugFromWorkspaceId,
  PERSONAL_WORKSPACE_ID,
} from "../../lib/space-id";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";

function workspaceIdMatches(id: string, team: TeamRef): boolean {
  return team.personal
    ? id === PERSONAL_WORKSPACE_ID
    : orgSlugFromWorkspaceId(id) === team.slug;
}

export function useAgentOrgMove(agent: Agent, open: boolean) {
  const [state, setState] = useState<ShareViaTeamState>(initialState);
  const orgs = useOrgs(open);
  const moveAgent = useMoveAgent();
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);

  const moveId = state.step === "moving" ? state.moveId : null;
  const polled = useAgentMoveStatus(
    agent.id,
    moveId,
    state.step === "moving",
  ).data;

  useEffect(() => {
    if (!open) {
      setState(initialState());
      releaseMove(agent.id);
    }
  }, [open, agent.id]);
  useEffect(() => () => releaseMove(agent.id), [agent.id]);

  useEffect(() => {
    if (!polled) return;
    setState((s) => applyMovePoll(s, polled));
  }, [polled]);

  useEffect(() => {
    if (moveId === null) return;
    const timer = setTimeout(
      () => setState((s) => moveTimedOut(s)),
      MOVE_POLL_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [moveId]);

  useEffect(() => {
    if (state.step !== "switching") return;
    clearPendingMove(agent.id);
    const { team } = state;
    let cancelled = false;
    void (async () => {
      try {
        await loadWorkspaces();
        const ws = useWorkspaceStore
          .getState()
          .workspaces.find((w) => workspaceIdMatches(w.id, team));
        if (cancelled) return;
        if (!ws) {
          setState((s) => switchFailed(s));
          return;
        }
        setCurrentWorkspace(ws);
        await loadAgents(ws.id);
        if (cancelled) return;
        setState((s) => switchDone(s));
      } catch {
        if (!cancelled) setState((s) => switchFailed(s));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, agent.id, loadWorkspaces, setCurrentWorkspace, loadAgents]);

  const move = async () => {
    if (state.step !== "confirm" && state.step !== "moveFailed") return;
    const { slug: toSlug, name: teamName } = state.team;
    try {
      const { moveId: id } = await moveAgent.mutateAsync({
        agentSlugOrId: agent.id,
        toSlug,
      });
      recordPendingMove({
        agentId: agent.id,
        agentName: agent.name,
        teamSlug: toSlug,
        teamName,
        moveId: id,
        startedAt: Date.now(),
      });
      claimMove(agent.id);
      setState((s) => startMove(s, id));
    } catch (err) {
      setState((s) => moveRejected(s, shareErrorCode(err)));
    }
  };

  return { state, setState, orgs, moving: moveAgent.isPending, move };
}
