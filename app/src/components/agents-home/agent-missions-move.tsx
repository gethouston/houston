import { useState } from "react";
import { useTeams } from "../../hooks/use-teams";
import { teamOfAgent } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import {
  AgentMoveDialog,
  AgentMovePickerDialog,
  type MoveTarget,
} from "../agent-actions/agent-move-action";
import { useMoveAgentTeam } from "../team-view/use-move-agent-team";

/** The phone task list's Move to group flow: the group picker, then the
 *  confirmation that performs the move. */
export function AgentMissionsMoveDialogs({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const teams = useTeams();
  const currentTeam = teamOfAgent(teams, agent.id);
  const moveAgent = useMoveAgentTeam();
  const [pendingTarget, setPendingTarget] = useState<MoveTarget | null>(null);
  return (
    <>
      <AgentMovePickerDialog
        open={open}
        onOpenChange={onOpenChange}
        teams={teams}
        currentTeamId={currentTeam?.id ?? null}
        onSelect={(target) => {
          onOpenChange(false);
          setPendingTarget(target);
        }}
      />
      <AgentMoveDialog
        agent={agent}
        target={pendingTarget}
        onOpenChange={(next) => {
          if (!next) setPendingTarget(null);
        }}
        onConfirm={() => {
          if (pendingTarget)
            moveAgent(
              agent.id,
              pendingTarget.kind === "team" ? pendingTarget.team : null,
            );
          setPendingTarget(null);
        }}
      />
    </>
  );
}
