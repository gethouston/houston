import { useState } from "react";
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
  /** What the three hire questions and the naming card read and write. */
  flow: CreateAgentFlow;
  /** The answers the questions give. Its industry is the team's: where the
   *  next hire and the basic team start, whatever a naming card changed. */
  team: AgentRoleState;
  /** A fresh job, name and color for the next hire; the industry question's
   *  answer stays, since a team is usually hired for one business. */
  startNextHire: () => void;
}

/**
 * The HIRE path of the team card: the in-app hire's questions and naming
 * card, filled into a workspace the card names.
 *
 * Hire never waits: the new employee joins the roster at once and is created
 * behind the person (`useTeamRoster`), who lands straight on the roster. The
 * name is required, and checked against the hires still on their way too, so
 * two quick hires can never ask for the same name.
 *
 * `start` is the survey's industry; it is read once, when the card mounts
 * (`useAgentRoleState` only takes a start on open). An industry changed on
 * the naming card is that hire's alone (`hireCardRoleState`).
 */
export function useTeamHireFlow({
  start,
  roster,
  onHired,
}: {
  start: AgentRoleStart;
  roster: TeamRoster;
  /** A hire joined the roster: the card moves on to it. */
  onHired: () => void;
}): TeamHireFlow {
  const issueCopy = useEmployeeNameIssueCopy();
  const team = useAgentRoleState(true, start);
  const [cardIndustry, setCardIndustry] = useState<string | null>(null);
  const roleState = hireCardRoleState(team, cardIndustry, setCardIndustry);
  const [name, setName] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [color, setColor] = useState(() => roster.nextColor());

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
      onNameChange: setName,
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
      setName("");
      setAttempted(false);
      setColor(roster.nextColor());
    },
  };
}
