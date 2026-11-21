import type { PortableInventoryPreview } from "@houston/engine-adapter";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import { AGENT_NAME_MAX_LENGTH, agentNameIssue } from "../../lib/agent-name";
import { getEngine } from "../../lib/engine";
import { genericErrorDescription } from "../../lib/error-report";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { suggestCopyName } from "../agent-actions/copy-agent-model";
import { useCopyAgent } from "../agent-actions/use-copy-agent";
import { useEmployeeNameIssueCopy } from "../employee-card/use-employee-name";
import {
  type CopyWizardStep,
  copyWizardSteps,
  fullCopySelection,
  toCopySelection,
  type WizardSelection,
} from "./copy-agent-wizard-model";

export function useCopyAgentWizard(args: {
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("agents");
  const agents = useAgentStore((s) => s.agents);
  const { capabilities } = useCapabilities();
  const addToast = useUIStore((s) => s.addToast);
  const copyAgent = useCopyAgent();
  const issueCopy = useEmployeeNameIssueCopy({
    taken: (trimmed) => t("copyAgent.nameTaken", { name: trimmed }),
  });

  const [source, setSource] = useState<Agent | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PortableInventoryPreview | null>(null);
  const [selection, setSelection] = useState<WizardSelection | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [copyChats, setCopyChats] = useState(false);
  const [chatCount, setChatCount] = useState(0);

  const sources = agents.filter((agent) => isAgentManager(capabilities, agent));
  const steps = copyWizardSteps(preview);
  const step: CopyWizardStep = steps[stepIndex] ?? "source";
  const existingNames = agents.map((agent) => agent.name);
  const nameIssue = agentNameIssue(name, existingNames);
  const nameIssueMessage = issueCopy(nameIssue, name);

  const pick = async (agent: Agent) => {
    setLoadingId(agent.id);
    try {
      const [next, conversations] = await Promise.all([
        getEngine().portablePreview(agent.folderPath),
        getEngine().listConversations(agent.folderPath),
      ]);
      setSource(agent);
      setPreview(next);
      setSelection(fullCopySelection(next));
      setCopyChats(false);
      setChatCount(conversations.length);
      setName(
        suggestCopyName(
          agent.name,
          existingNames,
          t("copyAgent.copySuffix"),
          AGENT_NAME_MAX_LENGTH,
        ),
      );
      setColor(agent.color);
      setStepIndex(1);
    } catch (err) {
      addToast({
        variant: "error",
        title: t("copyAgent.errors.failed"),
        description: genericErrorDescription("agent_copy_preview", err),
      });
    } finally {
      setLoadingId(null);
    }
  };

  const back = () =>
    stepIndex > 0 ? setStepIndex(stepIndex - 1) : args.onBack();
  const next = () => setStepIndex(stepIndex + 1);

  const reset = () => {
    setSource(null);
    setPreview(null);
    setSelection(null);
    setStepIndex(0);
    setName("");
    setColor(undefined);
    setCopyChats(false);
    setChatCount(0);
  };

  const submit = async () => {
    if (creating || !source || !selection || !name.trim() || nameIssue) return;
    setCreating(true);
    const ok = await copyAgent({
      agent: source,
      name,
      team: null,
      color,
      selection: toCopySelection(selection),
      copyChats,
      via: "create_dialog",
    });
    setCreating(false);
    if (ok) args.onDone();
  };

  return {
    sources,
    source,
    loadingId,
    preview,
    selection,
    setSelection,
    copyChats,
    setCopyChats,
    chatCount,
    steps,
    stepIndex,
    step,
    name,
    setName,
    color,
    setColor,
    creating,
    nameIssue,
    nameIssueMessage,
    pick,
    back,
    next,
    reset,
    submit,
  };
}

export type CopyAgentWizardState = ReturnType<typeof useCopyAgentWizard>;
