import { useEffect, useState } from "react";
import { logAndReportError } from "../../lib/error-report";
import { nextFreeAgentColor } from "../../lib/next-agent-color";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import {
  employeeNameIssue,
  visibleNameIssue,
} from "../employee-card/employee-name-validation";
import { useEmployeeNameIssueCopy } from "../employee-card/use-employee-name";
import {
  type CreateFlowIdentity,
  createFlowIdentity,
  createNameInvalid,
} from "./create-agent-flow-model";
import { type AgentRoleState, useAgentRoleState } from "./use-agent-role-state";
import {
  type CreateFailure,
  useCreateBlankAgent,
} from "./use-create-blank-agent";

/** How a press of the naming screen's primary went. */
export type CreateSubmitOutcome = "invalid" | "submitted";

/**
 * Everything the naming screen (`CustomizeStep`) and the bottom bar read from a
 * hire in progress. Spelled out rather than inferred from one hook because two
 * flows fill it: the create sheet, and the onboarding team card, which hires
 * into a workspace it names itself and stays on screen afterwards.
 */
export interface CreateAgentFlow {
  roleState: AgentRoleState;
  name: string;
  color: string;
  /** Names the hire cannot take; Suggest steps over them too. */
  takenNames: readonly string[];
  /** The card's message slot: why the name cannot be taken, or why the
   *  create did not land. */
  message: string | null;
  /** The name holds the hire back, and the card shows why. */
  nameInvalid: boolean;
  creating: boolean;
  /** Held beyond the name while the brief is unfinished. */
  submitBlocked: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  /** Hires under the typed name, or answers `invalid` and has the card say
   *  why, so the screen can take the person to the field. */
  submit: () => CreateSubmitOutcome;
}

/**
 * Everything the HIRE path collects: the two brief answers, then the identity
 * the new agent is born with. Lifted out of the sheet so the sheet stays the
 * shape of the flow (which screen is on, and what its header and bottom bar
 * say) rather than the shape of one of its paths.
 *
 * The name is required: a blank one is only flagged once the person presses
 * on. Every field resets when the sheet shuts, so a second open is a fresh
 * hire and never the last one's half-finished answers.
 */
export function useCreateAgentFlow({
  open,
  targetTeamId,
  onDone,
}: {
  open: boolean;
  targetTeamId: string | null;
  onDone: () => void;
}): CreateAgentFlow {
  const issueCopy = useEmployeeNameIssueCopy();
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const existingAgents = useAgentStore((s) => s.agents);
  const roleState = useAgentRoleState(open);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<CreateFailure | null>(null);
  const [submitted, setSubmitted] = useState<CreateFlowIdentity | null>(null);
  const selectedDef = agentDefs.find((d) => d.config.id === "blank");

  const { creating, createBlankAgent } = useCreateBlankAgent({
    open,
    targetTeamId,
    selectedDef,
    onError: setError,
    onDone,
  });

  useEffect(() => {
    if (open) return;
    setName("");
    setPicked(null);
    setAttempted(false);
    setError(null);
    setSubmitted(null);
  }, [open]);

  const { takenNames, color } = createFlowIdentity({
    live: {
      takenNames: existingAgents.map((a) => a.name),
      color: picked ?? nextFreeAgentColor(existingAgents.map((a) => a.color)),
    },
    submitted,
    creating,
  });
  const issue = employeeNameIssue(name, takenNames);
  const shown = visibleNameIssue(issue, attempted);
  const message = error?.message ?? issueCopy(shown, name);

  return {
    roleState,
    name,
    color,
    takenNames,
    message,
    nameInvalid: createNameInvalid(shown, error?.kind ?? null),
    creating,
    submitBlocked: roleState.brief === null,
    // Typing again clears a stale server rejection so the live validation copy
    // (or nothing) takes over.
    onNameChange: (value) => {
      setName(value);
      if (error) setError(null);
    },
    onColorChange: setPicked,
    submit: () => {
      const brief = roleState.brief;
      if (issue || !brief) {
        setAttempted(true);
        return "invalid";
      }
      setSubmitted({ takenNames, color });
      createBlankAgent(name, color, brief).catch((err: unknown) =>
        logAndReportError("create_agent_submit", err),
      );
      return "submitted";
    },
  };
}
