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
  /** Drop the job and keep the industry: the next hire in the same world. */
  clearRole: () => void;
  /** An answer given again on the employee card, as the person reads it: a
   *  catalog label picks its entry, other words are the typed answer. Unlike
   *  `chooseContext`, a new industry keeps the job. */
  answerBrief: (field: JobBriefField, answer: string) => void;
}

/**
 * Where the two questions open: a catalog entry to preselect, or the words of
 * an answer the catalog does not list. Both empty opens a question blank.
 */
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

/**
 * The context + role answers a hire collects, and the brief they add up to.
 * Every open starts from `start`: the in-app create dialog passes nothing, so
 * an agent's industry is its own and nothing is preselected there; onboarding
 * passes the person's own survey answers, because a first team is hired for
 * the business they just described.
 */
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

  // Only an open resets: a start that settles while the questions are on
  // screen must never overwrite an answer the user already changed.
  /* oxlint-disable react-hooks/exhaustive-deps -- `open` is the whole trigger. */
  useEffect(() => {
    if (!open) return;
    setContextId(start.contextId);
    setContextIsCustom(startsCustom(start.contextId, start.customContext));
    setCustomContext(capRolePart(start.customContext));
    setRoleId(start.roleId);
    setRoleIsCustom(startsCustom(start.roleId, start.customRole));
    setCustomRole(capRolePart(start.customRole));
  }, [open]);
  /* oxlint-enable react-hooks/exhaustive-deps */

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
