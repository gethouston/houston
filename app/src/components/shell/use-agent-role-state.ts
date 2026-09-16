import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentContextId, AgentRoleId } from "../../lib/agent-role-catalog";
import {
  type AgentRoleContext,
  capRolePart,
  createAgentRoleContext,
} from "../../lib/agent-role-context";

export interface AgentRoleState {
  contextId: AgentContextId | null;
  /** "Something else" is the picked answer: the typed field is the live one. */
  contextIsCustom: boolean;
  customContext: string;
  roleId: AgentRoleId | null;
  roleIsCustom: boolean;
  customRole: string;
  /** The answers as the user reads them — the labels that go into the agent's
   *  job description, never the catalog ids. */
  contextLabel: string;
  roleLabel: string;
  /** The finished brief, or null while either answer is still missing. */
  brief: AgentRoleContext | null;
  chooseContext: (id: AgentContextId) => void;
  chooseCustomContext: () => void;
  /** Leave the typed answer and go back to the suggestions (Escape). */
  cancelCustomContext: () => void;
  /** Capped to the brief's own length (`AGENT_ROLE_PART_MAX_LENGTH`) whoever
   *  writes it: the field, or the filter's query taken as the answer. */
  writeCustomContext: (value: string) => void;
  chooseRole: (id: AgentRoleId) => void;
  chooseCustomRole: () => void;
  cancelCustomRole: () => void;
  /** Capped like {@link AgentRoleState.writeCustomContext}. */
  writeCustomRole: (value: string) => void;
}

/**
 * The context + role answers the create dialog collects, and the brief they
 * add up to. Both questions start EMPTY on every open: the agent's industry
 * and job are its own, never carried over from the user's onboarding answers, so
 * nothing is ever preselected.
 */
export function useAgentRoleState(open: boolean): AgentRoleState {
  const { t } = useTranslation("agentOnboarding");
  const [contextId, setContextId] = useState<AgentContextId | null>(null);
  const [contextIsCustom, setContextIsCustom] = useState(false);
  const [customContext, setCustomContext] = useState("");
  const [roleId, setRoleId] = useState<AgentRoleId | null>(null);
  const [roleIsCustom, setRoleIsCustom] = useState(false);
  const [customRole, setCustomRole] = useState("");

  const clearRole = () => {
    setRoleId(null);
    setRoleIsCustom(false);
    setCustomRole("");
  };

  useEffect(() => {
    if (!open) return;
    setContextId(null);
    setContextIsCustom(false);
    setCustomContext("");
    setRoleId(null);
    setRoleIsCustom(false);
    setCustomRole("");
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

  // Each question holds exactly one answer: picking from the catalog drops the
  // typed one and vice versa, so a re-pick can never strand stale words in the
  // job description. A new context also drops the role, which was picked from
  // the previous context's list.
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
    // Capped HERE rather than only in the field: "use what you typed" seeds
    // the answer straight from the filter's query, which wears no `maxLength`
    // of the answer's own.
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
  };
}
