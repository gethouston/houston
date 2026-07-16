import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type { SuggestedRoutine } from "@houston-ai/engine-client";
import type { RoutineFormData } from "@houston-ai/routines";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { STORE_TEMPLATE_IDS } from "../../agents/builtin/store-catalog";
import { loadStoreTemplate } from "../../agents/builtin/store-template-loader";
import { DEFAULT_TAB_ID } from "../../agents/standard-tabs";
import { useCapabilities } from "../../hooks/use-capabilities";
import { finishAgentSetup } from "../../lib/agent-setup";
import { startAgentSetupMission } from "../../lib/agent-setup-mission";
import { getDefaultModel } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { integrationsAvailable } from "../onboarding/missions/onboarding-flow";
import { AgentPickerStep } from "./agent-picker-step";
import { AiAssistStep } from "./ai-assist-step";
import { AiReviewStep } from "./ai-review-step";
import { AiRoutineStep } from "./ai-routine-step";
import { ConnectAppsStep } from "./connect-apps-step";
import { NamingStep } from "./naming-step";

type Step = 1 | "ai-assist" | "ai-routine" | "ai-review" | "connect" | 2;

/** The just-created agent held for the in-dialog connect step. */
interface CreatedAgent {
  id: string;
  name: string;
  folderPath: string;
  /** Toolkit slugs the chosen definition declares, offered in the step. */
  toolkits: string[];
}

export function CreateAgentDialog() {
  const { t, i18n } = useTranslation("shell");
  const open = useUIStore((s) => s.createAgentDialogOpen);
  const setOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const uiTourActive = useUIStore((s) => s.uiTourActive);
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const createAgent = useAgentStore((s) => s.create);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const { capabilities } = useCapabilities();

  const [step, setStep] = useState<Step>(1);
  const [createdAgent, setCreatedAgent] = useState<CreatedAgent | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [generatedClaudeMd, setGeneratedClaudeMd] = useState<
    string | undefined
  >(undefined);
  const [brief, setBrief] = useState("");
  const [routineForm, setRoutineForm] = useState<RoutineFormData | null>(null);
  const [routineAccepted, setRoutineAccepted] = useState(false);
  // The AI suggestion the current routineForm was seeded from. Used to
  // avoid wiping the user's edits when they navigate back to ai-assist
  // and continue again without regenerating.
  const seededRoutineRef = useRef<SuggestedRoutine | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("anthropic");
  const [model, setModel] = useState<string>(getDefaultModel("anthropic"));

  // Reset form on close. On open, load the sticky last-used provider/model —
  // the pair becomes the new agent's brain (and the generation brain on the AI
  // path, where the ai-assist step shows a picker to change it). Reading on
  // open (not mount) prevents the old "stale workspace default baked into the
  // new agent's config" bug.
  useEffect(() => {
    if (!open) {
      setStep(1);
      setCreatedAgent(null);
      setSelectedConfigId(null);
      setGeneratedClaudeMd(undefined);
      setBrief("");
      setRoutineForm(null);
      setRoutineAccepted(false);
      seededRoutineRef.current = null;
      setName("");
      setColor(undefined);
      setError(null);
      setCreating(false);
      setSearch("");
      setExistingPath(null);
      return;
    }
    let cancelled = false;
    tauriProvider.getLastUsed().then(({ provider: p, model: m }) => {
      if (cancelled) return;
      const nextProvider = p ?? "anthropic";
      setProvider(nextProvider);
      setModel(m ?? getDefaultModel(nextProvider));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleClose = () => {
    setOpen(false);
  };

  // A pick in the ai-assist step drives the generation turn, becomes the new
  // agent's brain, and sticks as the next dialog's default. `setLastUsed`
  // surfaces its own error toast (the `call` wrapper), so the local state —
  // which is what this create actually uses — is applied regardless.
  const handleModelChange = (nextProvider: string, nextModel: string) => {
    setProvider(nextProvider);
    setModel(nextModel);
    tauriProvider.setLastUsed(nextProvider, nextModel).catch(() => {});
  };

  const handleCreateAgent = async () => {
    const trimmed = name.trim();
    // `creating` also gates re-entry: the submit button is disabled while in
    // flight, but Enter in the name input still fires the form's onSubmit.
    if (creating || !trimmed || !selectedConfigId || !currentWorkspace) return;
    setError(null);
    setCreating(true);
    // AI-generated instructions take priority over the template's claudeMd.
    let claudeMd = generatedClaudeMd ?? selectedDef?.config.claudeMd;
    let seeds = selectedDef?.config.agentSeeds;
    let created: { id: string; name: string; color?: string };
    let agentPath: string;
    try {
      // First-party "store" templates (bookkeeping, legal, …) keep their
      // CLAUDE.md + skills/data seeds in a lazily-loaded payload kept out of
      // the initial bundle; pull it now so the host seeds the new agent with
      // them. The active UI language picks the translated variant, so a
      // Spanish workspace seeds Spanish skills.
      if (!generatedClaudeMd && STORE_TEMPLATE_IDS.has(selectedConfigId)) {
        const tpl = await loadStoreTemplate(selectedConfigId, i18n.language);
        claudeMd = tpl.claudeMd;
        seeds = tpl.seeds;
      }
      const { agent } = await createAgent(
        currentWorkspace.id,
        trimmed,
        selectedConfigId,
        color,
        claudeMd,
        selectedDef?.path,
        seeds,
        existingPath ?? undefined,
      );
      created = agent;
      agentPath = agent.folderPath;
    } catch (err) {
      setError(String(err));
      setCreating(false);
      return;
    }
    // Reveal the agent NOW. The provider/model write and routine setup dispatch
    // to the agent's engine, which on the hosted profile is a pod still
    // cold-starting — awaiting them here would re-block the dialog for the whole
    // pod warm-up (HOU-649), the exact stall this is fixing. The agent already
    // exists and is current; finish its setup in the background. Both writes
    // land before the pod is usable enough to send a message, and each surfaces
    // its own error toast on failure.
    useUIStore.getState().setViewMode(DEFAULT_TAB_ID);
    void finishAgentSetup(agentPath, {
      provider,
      model,
      routine: routineAccepted ? routineForm : null,
    });
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
      { provider, model },
      "created",
    );
    // Templates that declare integrations keep a connect-apps step, but inside
    // this dialog now, not a separate screen. Otherwise just close.
    const toolkits = (selectedDef?.config.integrations ?? [])
      .map((s) => s.trim())
      .filter(Boolean);
    if (toolkits.length > 0 && integrationsAvailable(capabilities)) {
      setCreating(false);
      setCreatedAgent({
        id: created.id,
        name: created.name,
        folderPath: agentPath,
        toolkits,
      });
      setStep("connect");
      return;
    }
    handleClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await handleCreateAgent();
  };

  const selectedDef = agentDefs.find((d) => d.config.id === selectedConfigId);

  const aiReviewBackStep = (): Step =>
    routineForm ? "ai-routine" : "ai-assist";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
      // Modal mode applies pointer-events:none to everything outside the
      // dialog. While the tour is on, that would block the tour's own
      // Next/Back buttons (rendered outside DialogContent). Drop modality
      // for the tour and let the tour's overlay own the focus instead.
      modal={!uiTourActive}
    >
      <DialogContent
        className="sm:max-w-[900px] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
        // Even with modal=false, Radix still calls outside-dismiss on
        // pointer-down outside the content. Suppress while the tour is
        // active so clicking the tour's Next button doesn't kill the
        // dialog mid-step; the tour closes it explicitly on the outro.
        onPointerDownOutside={(e) => {
          if (uiTourActive) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (uiTourActive) e.preventDefault();
        }}
      >
        {step === 1 ? (
          <>
            <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
              <DialogTitle>{t("newAgent.dialogTitle")}</DialogTitle>
            </DialogHeader>

            <AgentPickerStep
              search={search}
              onSearchChange={setSearch}
              agents={agentDefs}
              onSelect={(id) => {
                setSelectedConfigId(id);
                setGeneratedClaudeMd(undefined);
                setStep(2);
              }}
              onCreateWithAi={() => {
                setSelectedConfigId("blank");
                setGeneratedClaudeMd(undefined);
                setStep("ai-assist");
              }}
            />
          </>
        ) : step === "ai-assist" ? (
          <AiAssistStep
            provider={provider}
            model={model}
            onModelChange={handleModelChange}
            brief={brief}
            onBriefChange={setBrief}
            onBack={() => setStep(1)}
            onContinue={(instructions, suggestedName, routine) => {
              setGeneratedClaudeMd(instructions);
              // Only (re)seed the editable routine when the AI produced a
              // new suggestion. If the user just navigated back here and
              // continued, keep their edits and accept choice intact.
              if (routine !== seededRoutineRef.current) {
                seededRoutineRef.current = routine;
                setRoutineForm(
                  routine
                    ? {
                        name: routine.name,
                        prompt: routine.prompt,
                        schedule: routine.schedule,
                        suppress_when_silent: true,
                        chat_mode: "shared",
                        integrations: [],
                      }
                    : null,
                );
                setRoutineAccepted(false);
              }
              if (!name.trim()) setName(suggestedName);
              setStep(routine ? "ai-routine" : "ai-review");
            }}
          />
        ) : step === "ai-routine" && routineForm ? (
          <AiRoutineStep
            routine={routineForm}
            onRoutineChange={setRoutineForm}
            accepted={routineAccepted}
            onAcceptedChange={setRoutineAccepted}
            onBack={() => setStep("ai-assist")}
            onContinue={() => setStep("ai-review")}
          />
        ) : step === "ai-review" ? (
          <AiReviewStep
            name={name}
            color={color}
            instructions={generatedClaudeMd ?? ""}
            onNameChange={setName}
            onColorChange={setColor}
            onInstructionsChange={setGeneratedClaudeMd}
            onBack={() => setStep(aiReviewBackStep())}
            onSubmit={handleCreateAgent}
            creating={creating}
            error={error}
          />
        ) : step === "connect" && createdAgent ? (
          <ConnectAppsStep
            agent={createdAgent}
            toolkits={createdAgent.toolkits}
            onDone={handleClose}
          />
        ) : (
          <NamingStep
            selectedAgent={selectedDef}
            name={name}
            color={color}
            error={error}
            existingPath={existingPath}
            creating={creating}
            showLinkProject={selectedDef?.config.features?.includes(
              "link-project",
            )}
            onNameChange={setName}
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
