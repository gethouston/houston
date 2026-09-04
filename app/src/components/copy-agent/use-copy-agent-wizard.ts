import type { PortableInventoryPreview } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useTeams } from "../../hooks/use-teams";
import { isAgentManager } from "../../lib/agent-access";
import { AGENT_NAME_MAX_LENGTH, agentNameIssue } from "../../lib/agent-name";
import { getEngine } from "../../lib/engine";
import { genericErrorDescription } from "../../lib/error-report";
import type { WizardSelection } from "../../lib/portable-share";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { suggestCopyName } from "../agent-actions/copy-agent-model";
import { useCopyAgent } from "../agent-actions/use-copy-agent";
import {
  type CopyWizardStep,
  copyWizardSteps,
  fullCopySelection,
  toCopySelection,
} from "./copy-agent-wizard-model";

/**
 * The copy wizard's state: which source, what it carries, what stays switched
 * on, and the name and color the copy is born with. `pick` reads the source's
 * shareable content and advances; `submit` runs the same portable copy the
 * Settings "Copy agent" row runs, fed this selection.
 */
export function useCopyAgentWizard(args: {
  targetTeamId: string | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("agents");
  const agents = useAgentStore((s) => s.agents);
  const { capabilities } = useCapabilities();
  const teams = useTeams();
  const addToast = useUIStore((s) => s.addToast);
  const copyAgent = useCopyAgent();

  const [source, setSource] = useState<Agent | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PortableInventoryPreview | null>(null);
  const [selection, setSelection] = useState<WizardSelection | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  // Chats are opt-IN: a conversation can hold personal details the new agent
  // has no business knowing, so unlike every other item they start off.
  const [copyChats, setCopyChats] = useState(false);

  // Only agents whose content the caller may read: a "user"-access agent's
  // portable preview is refused by the gateway, so it never appears here.
  const sources = agents.filter((agent) => isAgentManager(capabilities, agent));
  const steps = copyWizardSteps(preview);
  const step: CopyWizardStep = steps[stepIndex] ?? "source";
  const existingNames = agents.map((agent) => agent.name);
  const nameIssue = agentNameIssue(name, existingNames);
  const nameIssueMessage =
    nameIssue === "taken"
      ? t("copyAgent.nameTaken", { name: name.trim() })
      : nameIssue === "tooLong"
        ? t("nameErrors.tooLong", { max: AGENT_NAME_MAX_LENGTH })
        : nameIssue === "invalidChars"
          ? t("nameErrors.invalidChars")
          : null;

  const pick = async (agent: Agent) => {
    setLoadingId(agent.id);
    try {
      const next = await getEngine().portablePreview(agent.folderPath);
      setSource(agent);
      setPreview(next);
      setSelection(fullCopySelection(next));
      setCopyChats(false);
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

  const submit = async () => {
    if (creating || !source || !selection || !name.trim() || nameIssue) return;
    setCreating(true);
    const team = teams.find((entry) => entry.id === args.targetTeamId) ?? null;
    const ok = await copyAgent({
      agent: source,
      name,
      team,
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
    submit,
  };
}
