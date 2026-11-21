import { useState } from "react";
import { prefilledAgentName } from "../../../lib/agent-name-prefill";
import {
  employeeNameIssue,
  visibleNameIssue,
} from "../../employee-card/employee-name-validation";
import { useEmployeeNameIssueCopy } from "../../employee-card/use-employee-name";
import {
  type AgentRoleStart,
  type AgentRoleState,
  useAgentRoleState,
} from "../../shell/use-agent-role-state";
import type { CreateAgentFlow } from "../../shell/use-create-agent-flow";
import { hireCardRoleState } from "./hire-card-model";
import type { TeamRoster } from "./use-team-roster";

export interface TeamHireFlow {
  flow: CreateAgentFlow;
  team: AgentRoleState;
  startNextHire: () => void;
}

export function useTeamHireFlow({
  start,
  roster,
  onHired,
}: {
  start: AgentRoleStart;
  roster: TeamRoster;
  onHired: () => void;
}): TeamHireFlow {
  const issueCopy = useEmployeeNameIssueCopy();
  const team = useAgentRoleState(true, start);
  const [cardIndustry, setCardIndustry] = useState<string | null>(null);
  const roleState = hireCardRoleState(team, cardIndustry, setCardIndustry);
  const [typed, setTyped] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [color, setColor] = useState(() => roster.nextColor());

  const name =
    typed ?? prefilledAgentName(roleState.roleLabel, roster.takenNames);
  const issue = employeeNameIssue(name, roster.takenNames);
  const message = issueCopy(visibleNameIssue(issue, attempted), name);

  return {
    flow: {
      roleState,
      name,
      color,
      takenNames: roster.takenNames,
      message,
      nameInvalid: message !== null,
      creating: false,
      submitBlocked: roleState.brief === null,
      onNameChange: setTyped,
      onColorChange: setColor,
      submit: () => {
        const brief = roleState.brief;
        if (issue || !brief) {
          setAttempted(true);
          return "invalid";
        }
        roster.join({ name: name.trim(), color, brief });
        onHired();
        return "submitted";
      },
    },
    team,
    startNextHire: () => {
      team.clearRole();
      setCardIndustry(null);
      setTyped(null);
      setAttempted(false);
      setColor(roster.nextColor());
    },
  };
}
