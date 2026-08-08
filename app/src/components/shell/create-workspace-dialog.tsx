import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import { AGENT_NAME_MAX_LENGTH, agentNameIssue } from "../../lib/agent-name";
import { isAgentNameConflictError } from "../../lib/agent-name-conflict";
import { finishAgentSetup } from "../../lib/agent-setup";
import { startAgentSetupMission } from "../../lib/agent-setup-mission";
import { pickDefaultProviderModel } from "../../lib/default-provider-model";
import { openAgentBoard } from "../../lib/open-agent";
import { providerIsConnected } from "../../lib/provider-connection";
import { tauriProvider } from "../../lib/tauri";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { AgentPickerStep } from "./agent-picker-step";
import { NamingStep } from "./naming-step";

type Step = 1 | 2;

export function CreateAgentDialog() {
  const { t } = useTranslation(["shell", "agents"]);
  const open = useUIStore((s) => s.createAgentDialogOpen);
  const setOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const existingAgents = useAgentStore((s) => s.agents);
  const createAgent = useAgentStore((s) => s.create);
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const [lastUsed, setLastUsed] = useState<{
    provider: string | null;
    model: string | null;
  } | null>(null);
  const { statuses: providerStatuses } = useProviderStatuses();
  const connectedProviders = useMemo(
    () =>
      Object.values(providerStatuses)
        .filter((status) => providerIsConnected(status))
        .map((status) => status.provider),
    [providerStatuses],
  );

  // Reset form on close. On open, read the sticky provider/model preference so
  // the resolution at create time (against confirmed connections) becomes the
  // new agent's brain. Reading on open prevents a stale workspace default from
  // being baked into the new agent's config.
  useEffect(() => {
    if (!open) {
      setStep(1);
      setName("");
      setColor(undefined);
      setError(null);
      setCreating(false);
      setExistingPath(null);
      setLastUsed(null);
      return;
    }
    let cancelled = false;
    tauriProvider.getLastUsed().then(({ provider, model }) => {
      if (!cancelled) setLastUsed({ provider, model });
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleClose = () => {
    setOpen(false);
  };

  // Live pre-submit validation (HOU-1166): bad shapes and duplicate names get
  // localized inline copy under the field instead of the server's raw
  // rejection, and the submit button locks while the name is invalid.
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

  // Typing again clears a stale server rejection so the live validation copy
  // (or nothing) takes over.
  const handleNameChange = (value: string) => {
    setName(value);
    if (error) setError(null);
  };

  const selectedDef = agentDefs.find((d) => d.config.id === "blank");

  const handleCreateAgent = async () => {
    const trimmed = name.trim();
    // `creating` also gates re-entry: the submit button is disabled while in
    // flight, but Enter in the name input still fires the form's onSubmit.
    if (creating || !trimmed || nameIssue || !currentWorkspace) return;
    const resolved = pickDefaultProviderModel({
      lastUsedProvider: lastUsed?.provider,
      lastUsedModel: lastUsed?.model,
      connectedProviders,
    });
    const kickoffPin = resolved.confirmed
      ? { provider: resolved.provider, model: resolved.model }
      : {};
    setError(null);
    setCreating(true);
    let created: { id: string; name: string; color?: string };
    let agentPath: string;
    try {
      const { agent } = await createAgent(
        currentWorkspace.id,
        trimmed,
        "blank",
        color,
        selectedDef?.config.claudeMd,
        selectedDef?.path,
        selectedDef?.config.agentSeeds,
        existingPath ?? undefined,
      );
      created = agent;
      agentPath = agent.folderPath;
    } catch (err) {
      // A 409 is the expected "name already taken" state (a sibling created
      // it while the dialog was open) — friendly copy, not the wire error.
      setError(
        isAgentNameConflictError(err)
          ? t("agents:toasts.nameConflict", { name: trimmed })
          : String(err),
      );
      setCreating(false);
      return;
    }
    // Reveal the agent NOW. The provider/model write and setup mission dispatch
    // to the agent's engine, which on the hosted profile is a pod still
    // cold-starting — awaiting them here would re-block the dialog for the whole
    // pod warm-up (HOU-649). The agent already exists and is current; finish its
    // setup in the background. Each surfaces its own error toast on failure.
    openAgentBoard(created.id);
    void finishAgentSetup(agentPath, { ...kickoffPin, routine: null });
    // Auto-start the agent's self-setup mission in the normal shell: it
    // introduces itself and interviews the user, persisting what they say into
    // instructions / Skills / Routines. Fire-and-forget so it runs regardless
    // of what happens to the dialog next.
    void startAgentSetupMission(
      {
        id: created.id,
        name: created.name,
        color: created.color,
        folderPath: agentPath,
      },
      kickoffPin,
      "created",
    );
    handleClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await handleCreateAgent();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent
        className={
          step === 1
            ? "sm:max-w-[560px] p-0 gap-0 overflow-hidden"
            : "sm:max-w-[900px] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
        }
      >
        {step === 1 ? (
          <>
            <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
              <DialogTitle>{t("newAgent.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <AgentPickerStep onCreateBlank={() => setStep(2)} />
          </>
        ) : (
          <NamingStep
            selectedAgent={selectedDef}
            name={name}
            color={color}
            error={error ?? nameIssueMessage}
            existingPath={existingPath}
            creating={creating}
            nameInvalid={nameIssue !== null}
            showLinkProject={selectedDef?.config.features?.includes(
              "link-project",
            )}
            onNameChange={handleNameChange}
            onColorChange={setColor}
            onExistingPathChange={setExistingPath}
            onBack={() => setStep(1)}
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
