import { useState, useEffect, type FormEvent } from "react";
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
import { useConnectedToolkits, useConnections } from "../../hooks/queries";
import { tauriConfig } from "../../lib/tauri";
import type { StoreListing } from "../../lib/types";
import { getDefaultModel } from "../../lib/providers";
import { StoreStep } from "./store-step";
import { NamingStep } from "./naming-step";

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

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const wsProvider = currentWorkspace?.provider ?? "anthropic";
  const wsModel = currentWorkspace?.model ?? getDefaultModel(wsProvider);
  const [provider, setProvider] = useState(wsProvider);
  const [model, setModel] = useState(wsModel);

  // Pull connected toolkits so the discover disclosure inside StoreStep
  // can bias the recommender toward apps the user has already authorized.
  // Only enabled when the modal is open and Composio is set up — avoids
  // spinning up the query for users with no integrations provider.
  const { data: composioStatus } = useConnections();
  const { data: connectedToolkits } = useConnectedToolkits(
    open && composioStatus?.status === "ok",
  );

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedConfigId(null);
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
    try {
      const { agent } = await createAgent(
        currentWorkspace.id,
        trimmed,
        selectedConfigId,
        color,
        selectedDef?.config.claudeMd,
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
                setStep(2);
              }}
              onInstall={handleInstall}
              connectedToolkits={connectedToolkits ?? []}
            />
          </>
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
            onBack={() => setStep(1)}
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
