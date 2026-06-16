import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { tauriProvider } from "../../lib/tauri";
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
  const loadAgents = useAgentStore((s) => s.loadAgents);

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("shell:workspaceDialog.title")}</DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
