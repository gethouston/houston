import { useState, useEffect, useRef, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useUIStore } from "../../stores/ui";
import { tauriConfig, tauriRoutines } from "../../lib/tauri";
import { logger } from "../../lib/logger";
import type { SuggestedIntegration, SuggestedRoutine } from "@houston-ai/engine-client";
import type { RoutineFormData } from "@houston-ai/routines";
import type { StoreListing } from "../../lib/types";
import { getDefaultModel } from "../../lib/providers";
import { StoreStep } from "./store-step";
import { NamingStep } from "./naming-step";
import { AiAssistStep } from "./ai-assist-step";
import { AiRoutineStep } from "./ai-routine-step";
import { AiIntegrationsStep } from "./ai-integrations-step";

export function CreateAgentDialog() {
  const { t } = useTranslation("shell");
  const open = useUIStore((s) => s.createAgentDialogOpen);
  const setOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const uiTourActive = useUIStore((s) => s.uiTourActive);
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const storeCatalog = useAgentCatalogStore((s) => s.storeCatalog);
  const installAgent = useAgentCatalogStore((s) => s.installAgent);
  const createAgent = useAgentStore((s) => s.create);
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  const [step, setStep] = useState<1 | "ai-assist" | "ai-routine" | "ai-integrations" | 2>(1);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [generatedClaudeMd, setGeneratedClaudeMd] = useState<string | undefined>(undefined);
  const [suggestedIntegrations, setSuggestedIntegrations] = useState<SuggestedIntegration[]>([]);
  const [routineForm, setRoutineForm] = useState<RoutineFormData | null>(null);
  const [routineAccepted, setRoutineAccepted] = useState(false);
  // The AI suggestion the current routineForm was seeded from. Used to
  // avoid wiping the user's edits when they navigate back to ai-assist
  // and continue again without regenerating.
  const seededRoutineRef = useRef<SuggestedRoutine | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const wsProvider = currentWorkspace?.provider ?? "anthropic";
  const wsModel = currentWorkspace?.model ?? getDefaultModel(wsProvider);
  const [provider, setProvider] = useState(wsProvider);
  const [model, setModel] = useState(wsModel);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedConfigId(null);
      setGeneratedClaudeMd(undefined);
      setSuggestedIntegrations([]);
      setRoutineForm(null);
      setRoutineAccepted(false);
      seededRoutineRef.current = null;
      setName("");
      setColor(undefined);
      setError(null);
      setSearch("");
      setExistingPath(null);
      setProvider(wsProvider);
      setModel(wsModel);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setOpen(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !selectedConfigId || !currentWorkspace) return;
    // AI-generated instructions take priority over the template's claudeMd.
    const claudeMd = generatedClaudeMd ?? selectedDef?.config.claudeMd;
    try {
      const { agent } = await createAgent(
        currentWorkspace.id,
        trimmed,
        selectedConfigId,
        color,
        claudeMd,
        selectedDef?.path,
        selectedDef?.config.agentSeeds,
        existingPath ?? undefined,
      );
      // Write provider/model to agent config if different from workspace default
      if (provider !== wsProvider || model !== wsModel) {
        const cfg = await tauriConfig.read(agent.folderPath);
        await tauriConfig.write(agent.folderPath, {
          ...cfg,
          provider: provider as "anthropic" | "openai",
          model,
        });
      }
      if (routineAccepted && routineForm) {
        // The agent is brand new, so its scheduler was never started
        // (create() doesn't go through setCurrent, and use-houston-init
        // only starts schedulers that existed at launch). startScheduler
        // is idempotent and picks up the just-written routine; plain
        // syncScheduler would be a no-op for an unstarted agent.
        try {
          await tauriRoutines.create(agent.folderPath, {
            name: routineForm.name,
            description: routineForm.description,
            prompt: routineForm.prompt,
            schedule: routineForm.schedule,
            enabled: true,
            suppress_when_silent: routineForm.suppress_when_silent,
            timezone: routineForm.timezone,
          });
          await tauriRoutines.startScheduler(agent.folderPath);
        } catch (e) {
          // The agent is already created and the tauri wrapper surfaced
          // its own error toast. Log a breadcrumb and don't abort the
          // post-create flow over the routine.
          logger.error(`[new-agent] routine setup failed: ${e}`);
        }
      }
      const firstTab = selectedDef?.config.defaultTab ?? selectedDef?.config.tabs[0]?.id ?? "chat";
      useUIStore.getState().setViewMode(firstTab);
      handleClose();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleInstall = async (listing: StoreListing) => {
    await installAgent(listing);
  };

  const selectedDef = agentDefs.find((d) => d.config.id === selectedConfigId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) handleClose(); }}
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
        onPointerDownOutside={(e) => { if (uiTourActive) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (uiTourActive) e.preventDefault(); }}
      >
        {step === 1 ? (
          <>
            <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
              <DialogTitle>{t("newAgent.dialogTitle")}</DialogTitle>
            </DialogHeader>

            <StoreStep
              search={search}
              onSearchChange={setSearch}
              agents={agentDefs}
              storeCatalog={storeCatalog}
              onSelect={(id) => {
                setSelectedConfigId(id);
                setGeneratedClaudeMd(undefined);
                setStep(2);
              }}
              onInstall={handleInstall}
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
            onBack={() => setStep(1)}
            onContinue={(instructions, suggestedName, integrations, routine) => {
              setGeneratedClaudeMd(instructions);
              setSuggestedIntegrations(integrations);
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
                        timezone: null,
                      }
                    : null,
                );
                setRoutineAccepted(false);
              }
              if (!name.trim()) setName(suggestedName);
              setStep(
                integrations.length > 0
                  ? "ai-integrations"
                  : routine
                    ? "ai-routine"
                    : 2,
              );
            }}
          />
        ) : step === "ai-integrations" ? (
          <AiIntegrationsStep
            suggestedIntegrations={suggestedIntegrations}
            onBack={() => setStep("ai-assist")}
            onContinue={() => setStep(routineForm ? "ai-routine" : 2)}
          />
        ) : step === "ai-routine" && routineForm ? (
          <AiRoutineStep
            routine={routineForm}
            onRoutineChange={setRoutineForm}
            accepted={routineAccepted}
            onAcceptedChange={setRoutineAccepted}
            onBack={() =>
              setStep(suggestedIntegrations.length > 0 ? "ai-integrations" : "ai-assist")
            }
            onContinue={() => setStep(2)}
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
            showLinkProject={selectedDef?.config.features?.includes("link-project")}
            onNameChange={setName}
            onColorChange={setColor}
            onExistingPathChange={setExistingPath}
            onProviderChange={(p, m) => { setProvider(p); setModel(m); }}
            onBack={() => {
              if (generatedClaudeMd !== undefined) {
                setStep(
                  routineForm
                    ? "ai-routine"
                    : suggestedIntegrations.length > 0
                      ? "ai-integrations"
                      : "ai-assist",
                );
              } else {
                setStep(1);
              }
            }}
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
