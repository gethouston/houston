import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AGENT_CONTEXT_IDS,
  AGENT_ROLE_IDS,
  type AgentContextId,
  type AgentRoleId,
} from "../../lib/agent-role-catalog";
import {
  type AgentRoleContext,
  capRolePart,
  createAgentRoleContext,
} from "../../lib/agent-role-context";
import { type JobBriefField, jobAnswerEntry } from "../context/job-brief-model";

export interface AgentRoleState {
  contextId: AgentContextId | null;
  contextIsCustom: boolean;
  customContext: string;
  roleId: AgentRoleId | null;
  roleIsCustom: boolean;
  customRole: string;
  contextLabel: string;
  roleLabel: string;
  brief: AgentRoleContext | null;
  chooseContext: (id: AgentContextId) => void;
  chooseCustomContext: () => void;
  cancelCustomContext: () => void;
  writeCustomContext: (value: string) => void;
  chooseRole: (id: AgentRoleId) => void;
  chooseCustomRole: () => void;
  cancelCustomRole: () => void;
  writeCustomRole: (value: string) => void;
  clearRole: () => void;
  answerBrief: (field: JobBriefField, answer: string) => void;
}

export interface AgentRoleStart {
  contextId: AgentContextId | null;
  customContext: string;
  roleId: AgentRoleId | null;
  customRole: string;
}

export const EMPTY_ROLE_START: AgentRoleStart = {
  contextId: null,
  customContext: "",
  roleId: null,
  customRole: "",
};

const startsCustom = (id: string | null, words: string) =>
  id === null && words !== "";

export function useAgentRoleState(
  open: boolean,
  start: AgentRoleStart = EMPTY_ROLE_START,
): AgentRoleState {
  const { t } = useTranslation("agentOnboarding");
  const [contextId, setContextId] = useState<AgentContextId | null>(
    start.contextId,
  );
  const [contextIsCustom, setContextIsCustom] = useState(
    startsCustom(start.contextId, start.customContext),
  );
  const [customContext, setCustomContext] = useState(() =>
    capRolePart(start.customContext),
  );
  const [roleId, setRoleId] = useState<AgentRoleId | null>(start.roleId);
  const [roleIsCustom, setRoleIsCustom] = useState(
    startsCustom(start.roleId, start.customRole),
  );
  const [customRole, setCustomRole] = useState(() =>
    capRolePart(start.customRole),
  );

  const clearRole = () => {
    setRoleId(null);
    setRoleIsCustom(false);
    setCustomRole("");
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `open` is the whole trigger.
  useEffect(() => {
    if (!open) return;
    setContextId(start.contextId);
    setContextIsCustom(startsCustom(start.contextId, start.customContext));
    setCustomContext(capRolePart(start.customContext));
    setRoleId(start.roleId);
    setRoleIsCustom(startsCustom(start.roleId, start.customRole));
    setCustomRole(capRolePart(start.customRole));
  }, [open]);

  const contextLabel = contextIsCustom
    ? customContext
    : contextId
      ? t(`roleSetup.contexts.${contextId}`)
      : "";
  const roleLabel = roleIsCustom
    ? customRole
    : roleId
      ? t(`roleSetup.roles.${roleId}`)
      : "";

  return {
    contextId,
    contextIsCustom,
    customContext,
    roleId,
    roleIsCustom,
    customRole,
    contextLabel,
    roleLabel,
    brief: createAgentRoleContext({ context: contextLabel, role: roleLabel }),
    chooseContext: (id) => {
      setContextId(id);
      setContextIsCustom(false);
      clearRole();
    },
    chooseCustomContext: () => {
      setContextId(null);
      setContextIsCustom(true);
      clearRole();
    },
    cancelCustomContext: () => {
      setContextIsCustom(false);
      setCustomContext("");
    },
    writeCustomContext: (value) => setCustomContext(capRolePart(value)),
    chooseRole: (id) => {
      setRoleId(id);
      setRoleIsCustom(false);
    },
    chooseCustomRole: () => {
      setRoleId(null);
      setRoleIsCustom(true);
    },
    cancelCustomRole: () => {
      setRoleIsCustom(false);
      setCustomRole("");
    },
    writeCustomRole: (value) => setCustomRole(capRolePart(value)),
    clearRole,
    answerBrief: (field, answer) => {
      if (field === "industry") {
        const entry = jobAnswerEntry(
          AGENT_CONTEXT_IDS,
          (id) => t(`roleSetup.contexts.${id}`),
          answer,
        );
        setContextId(entry.id);
        setContextIsCustom(entry.id === null);
        setCustomContext(entry.typed);
        return;
      }
      const entry = jobAnswerEntry(
        AGENT_ROLE_IDS,
        (id) => t(`roleSetup.roles.${id}`),
        answer,
      );
      setRoleId(entry.id);
      setRoleIsCustom(entry.id === null);
      setCustomRole(entry.typed);
    },
  };
}
