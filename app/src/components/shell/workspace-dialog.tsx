import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
} from "@houston-ai/core";
import { analytics } from "../../lib/analytics";
import { tauriProvider, tauriStore } from "../../lib/tauri";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { WorkspaceSetupFlow } from "./workspace-setup-flow";
import { createPersonalAssistantForWorkspace } from "../onboarding/create-personal-assistant";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "../onboarding/personal-assistant-artifacts";

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["shell", "setup"]);
  const createWorkspace = useWorkspaceStore((s) => s.create);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const loadConfigs = useAgentCatalogStore((s) => s.loadConfigs);
  const [tab, setTab] = useState<"new" | "github">("new");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importUrl, setImportUrl] = useState("");

  const handleClose = () => {
    onOpenChange(false);
    setTab("new");
    setImporting(false);
    setImportError("");
    setImportUrl("");
  };

  const handleImportWorkspace = async () => {
    const trimmed = importUrl.trim();
    if (!trimmed) return;
    setImportError("");
    setImporting(true);
    try {
      const result = await tauriStore.installWorkspaceFromGithub(trimmed);
      await loadConfigs();
      await loadWorkspaces();
      const imported = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.id === result.workspaceId);
      if (imported) {
        setCurrentWorkspace(imported);
        await loadAgents(imported.id);
      }
      analytics.track("workspace_created", { source: "github_import" });
      handleClose();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("shell:workspaceDialog.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 pb-2">
          {(["new", "github"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                tab === item
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {item === "new"
                ? t("shell:workspaceDialog.tabNew")
                : t("shell:workspaceDialog.tabGithub")}
            </button>
          ))}
        </div>
        {tab === "new" ? (
          <WorkspaceSetupFlow
            mode="dialog"
            onComplete={async (name, provider, model) => {
              const ws = await createWorkspace(name);
              const setup = defaultAssistantSetup({
                workspaceName: name,
                assistantName: t("setup:tutorial.defaults.assistantName"),
                focus: t("setup:tutorial.defaults.focus"),
                approvalRule: t("setup:tutorial.defaults.approvalRule"),
              });
              await createPersonalAssistantForWorkspace(ws.id, {
                name: setup.assistantName,
                instructions: buildAssistantInstructions(
                  setup,
                  t("setup:tutorial.defaults.firstWorkflow"),
                ),
                provider,
                model,
              });
              await tauriProvider.setLastUsed(provider, model);
              setCurrentWorkspace(ws);
              await loadAgents(ws.id);
              handleClose();
            }}
          />
        ) : (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              {t("shell:workspaceDialog.githubDescription")}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={importUrl}
                onChange={(e) => {
                  setImportUrl(e.target.value);
                  setImportError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && importUrl.trim() && !importing) {
                    void handleImportWorkspace();
                  }
                }}
                placeholder={t("shell:workspaceDialog.githubPlaceholder")}
                disabled={importing}
                autoFocus
                className="h-9 flex-1 rounded-full border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
              <Button
                onClick={handleImportWorkspace}
                disabled={!importUrl.trim() || importing}
                className="shrink-0 rounded-full"
              >
                {importing ? (
                  <Spinner className="size-4" />
                ) : (
                  t("shell:workspaceDialog.githubImport")
                )}
              </Button>
            </div>
            {importError && (
              <p className="text-xs text-destructive">{importError}</p>
            )}
            {importing && (
              <div className="flex flex-col items-center gap-2 py-4">
                <Spinner className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("shell:workspaceDialog.githubImporting")}
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
