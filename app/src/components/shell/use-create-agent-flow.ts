import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AGENT_NAME_MAX_LENGTH, agentNameIssue } from "../../lib/agent-name";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useAgentRoleState } from "./use-agent-role-state";
import { useCreateBlankAgent } from "./use-create-blank-agent";

/**
 * Everything the HIRE path collects: the two brief answers, then the identity
 * the new agent is born with. Lifted out of the sheet so the sheet stays the
 * shape of the flow — which screen is on, and what its header and bottom bar
 * say — rather than the shape of one of its paths.
 *
 * Every field resets when the sheet shuts, so a second open is a fresh hire
 * and never the last one's half-finished answers.
 */
export function useCreateAgentFlow({
  open,
  targetTeamId,
  onDone,
}: {
  open: boolean;
  targetTeamId: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation(["shell", "agents"]);
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const existingAgents = useAgentStore((s) => s.agents);
  const roleState = useAgentRoleState(open);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const selectedDef = agentDefs.find((d) => d.config.id === "blank");

  const { creating, createBlankAgent } = useCreateBlankAgent({
    open,
    targetTeamId,
    selectedDef,
    existingPath,
    onError: setError,
    onDone,
  });

  useEffect(() => {
    if (open) return;
    setName("");
    setColor(undefined);
    setError(null);
    setExistingPath(null);
  }, [open]);

  const nameIssue = agentNameIssue(
    name,
    existingAgents.map((a) => a.name),
  );
  const nameIssueMessage =
    nameIssue === "invalidChars"
      ? t("agents:nameErrors.invalidChars")
      : nameIssue === "tooLong"
        ? t("agents:nameErrors.tooLong", { max: AGENT_NAME_MAX_LENGTH })
        : nameIssue === "taken"
          ? t("agents:toasts.nameConflict", { name: name.trim() })
          : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const brief = roleState.brief;
    if (!name.trim() || nameIssue || !brief) return;
    await createBlankAgent(name, color, brief);
  };

  return {
    roleState,
    name,
    color,
    error: error ?? nameIssueMessage,
    existingPath,
    creating,
    nameInvalid: nameIssue !== null,
    /** Held beyond the name's own validation while the brief is unfinished. */
    submitBlocked: roleState.brief === null,
    showLinkProject: selectedDef?.config.features?.includes("link-project"),
    // Typing again clears a stale server rejection so the live validation copy
    // (or nothing) takes over.
    onNameChange: (value: string) => {
      setName(value);
      if (error) setError(null);
    },
    onColorChange: setColor,
    onExistingPathChange: setExistingPath,
    onSubmit: handleSubmit,
  };
}

export type CreateAgentFlow = ReturnType<typeof useCreateAgentFlow>;
