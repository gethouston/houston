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
import { logger } from "../../lib/logger";
import { getDefaultModel } from "../../lib/providers";
import { tauriConfig, tauriProvider, tauriRoutines } from "../../lib/tauri";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { AgentPickerStep } from "./agent-picker-step";
import { AiAssistStep } from "./ai-assist-step";
import { AiReviewStep } from "./ai-review-step";
import { AiRoutineStep } from "./ai-routine-step";
import { NamingStep } from "./naming-step";

type Step = 1 | "ai-assist" | "ai-routine" | "ai-review" | 2;

export function CreateAgentDialog() {
  const { t } = useTranslation("shell");
  const open = useUIStore((s) => s.createAgentDialogOpen);
  const setOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const uiTourActive = useUIStore((s) => s.uiTourActive);
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const createAgent = useAgentStore((s) => s.create);
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  const [step, setStep] = useState<Step>(1);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [generatedClaudeMd, setGeneratedClaudeMd] = useState<
    string | undefined
  >(undefined);
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

  // Reset form on close. On open, sync the picker to the sticky last-used
  // pair. Reading on open (not mount) prevents the old "stale workspace
  // default baked into the new agent's config" bug: the picker always
  // reflects whatever the user actually picked last.
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedConfigId(null);
      setGeneratedClaudeMd(undefined);
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
    let agentPath: string;
    try {
      // First-party "store" templates (bookkeeping, legal, …) keep their
      // CLAUDE.md + skills/data seeds in a lazily-loaded payload kept out of the
      // initial bundle; pull it now so the host seeds the new agent with them.
      if (!generatedClaudeMd && STORE_TEMPLATE_IDS.has(selectedConfigId)) {
        const tpl = await loadStoreTemplate(selectedConfigId);
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
      agentPath = agent.folderPath;
    } catch (err) {
      setError(String(err));
      setCreating(false);
      return;
    }
    // Keep the sticky last-used in sync so the next new agent inherits the
    // user's most recent choice (local, so it's cheap to await).
    await tauriProvider.setLastUsed(provider, model);
    // Reveal the agent NOW. The provider/model write and routine setup dispatch
    // to the agent's engine, which on the hosted profile is a pod still
    // cold-starting — awaiting them here would re-block the dialog for the whole
    // pod warm-up (HOU-649), the exact stall this is fixing. The agent already
    // exists and is current; finish its setup in the background. Both writes
    // land before the pod is usable enough to send a message, and each surfaces
    // its own error toast on failure.
    useUIStore.getState().setViewMode(DEFAULT_TAB_ID);
    handleClose();
    void finishAgentSetup(agentPath, {
      provider,
      model,
      routine: routineAccepted ? routineForm : null,
    });
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
            onProviderChange={(p, m) => {
              setProvider(p);
              setModel(m);
            }}
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
                        description: "",
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
        ) : (
          <NamingStep
            selectedAgent={selectedDef}
            name={name}
            color={color}
            error={error}
            existingPath={existingPath}
            provider={provider}
            model={model}
            creating={creating}
            showLinkProject={selectedDef?.config.features?.includes(
              "link-project",
            )}
            onNameChange={setName}
            onColorChange={setColor}
            onExistingPathChange={setExistingPath}
            onProviderChange={(p, m) => {
              setProvider(p);
              setModel(m);
            }}
            onBack={() => setStep(1)}
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The pod-bound tail of agent creation, run after the dialog has already
 * revealed the agent (HOU-649): persist the picked provider/model and, if the
 * user accepted one, its starter routine. Both dispatch to the agent's engine,
 * so on the hosted profile they wait out the pod's cold start — off the create
 * click. Each step surfaces its own error toast via the tauri wrappers; we only
 * add a breadcrumb so a background failure is traceable.
 */
async function finishAgentSetup(
  agentPath: string,
  opts: { provider: string; model: string; routine: RoutineFormData | null },
): Promise<void> {
  try {
    // Always write provider/model to the agent's own config. With workspace
    // defaults retired, the agent is the single source of truth — leaving the
    // field blank would make the engine resolver fall back to its platform
    // default rather than the user's pick.
    const cfg = await tauriConfig.read(agentPath);
    await tauriConfig.write(agentPath, {
      ...cfg,
      provider: opts.provider as "anthropic" | "openai",
      model: opts.model,
    });
  } catch (e) {
    logger.error(`[new-agent] provider/model write failed: ${e}`);
  }

  if (opts.routine) {
    // The agent is brand new, so its scheduler was never started (create()
    // doesn't go through setCurrent, and use-houston-init only starts
    // schedulers that existed at launch). startScheduler is idempotent and
    // picks up the just-written routine; plain syncScheduler would be a no-op
    // for an unstarted agent.
    try {
      await tauriRoutines.create(agentPath, {
        name: opts.routine.name,
        description: opts.routine.description,
        prompt: opts.routine.prompt,
        schedule: opts.routine.schedule,
        enabled: true,
        suppress_when_silent: opts.routine.suppress_when_silent,
        chat_mode: opts.routine.chat_mode,
      });
      await tauriRoutines.startScheduler(agentPath);
    } catch (e) {
      // The tauri wrapper surfaced its own error toast; leave a breadcrumb.
      logger.error(`[new-agent] routine setup failed: ${e}`);
    }
  }
}
