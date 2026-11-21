import { useEffect, useState } from "react";
import { prefilledAgentName } from "../../lib/agent-name-prefill";
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

export type CreateSubmitOutcome = "invalid" | "submitted";

export interface CreateAgentFlow {
  roleState: AgentRoleState;
  name: string;
  color: string;
  takenNames: readonly string[];
  message: string | null;
  nameInvalid: boolean;
  creating: boolean;
  submitBlocked: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  submit: () => CreateSubmitOutcome;
}

export function useCreateAgentFlow({
  open,
  onDone,
}: {
  open: boolean;
  onDone: () => void;
}): CreateAgentFlow {
  const issueCopy = useEmployeeNameIssueCopy();
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const existingAgents = useAgentStore((s) => s.agents);
  const roleState = useAgentRoleState(open);
  const [typed, setTyped] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<CreateFailure | null>(null);
  const [submitted, setSubmitted] = useState<CreateFlowIdentity | null>(null);
  const selectedDef = agentDefs.find((d) => d.config.id === "blank");

  const { creating, createBlankAgent } = useCreateBlankAgent({
    open,
    selectedDef,
    onError: setError,
    onDone,
  });

  useEffect(() => {
    if (open) return;
    setTyped(null);
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
  const name = typed ?? prefilledAgentName(roleState.roleLabel, takenNames);
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
    onNameChange: (value) => {
      setTyped(value);
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
