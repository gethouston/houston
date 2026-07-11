import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-toast";
import { tauriProvider } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { createPersonalAssistantForWorkspace } from "../onboarding/create-personal-assistant";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "../onboarding/personal-assistant-artifacts";
import { WorkspaceSetupFlow } from "./workspace-setup-flow";

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
  const addToast = useUIStore((s) => s.addToast);

  const handleClose = () => {
    onOpenChange(false);
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
        <WorkspaceSetupFlow
          mode="dialog"
          onComplete={async (name, provider, model) => {
            try {
              const ws = await createWorkspace(name);
              const setup = defaultAssistantSetup({
                workspaceName: name,
                assistantName: t("setup:tutorial.defaults.assistantName"),
                focus: t("setup:tutorial.defaults.focus"),
                approvalRule: t("setup:tutorial.defaults.approvalRule"),
              });
              await createPersonalAssistantForWorkspace(ws.id, {
                name: setup.assistantName,
                instructions: buildAssistantInstructions(setup),
                provider,
                model,
              });
              await tauriProvider.setLastUsed(provider, model);
              setCurrentWorkspace(ws);
              await loadAgents(ws.id);
              handleClose();
            } catch (err) {
              // Don't let a create failure (e.g. a name that's already
              // taken) escape as an unhandled rejection — surface it and
              // keep the dialog open so the user can pick another name.
              addToast({
                title: t("shell:workspaceDialog.createFailed"),
                description: genericErrorDescription("create_workspace", err),
                variant: "error",
              });
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
