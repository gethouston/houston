import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useLocalModelConnect } from "../../hooks/use-local-model-connect";
import { osIsTauri } from "../../lib/os-bridge";
import type { ProviderInfo } from "../../lib/providers";
import { isTeamWorkspace } from "../../lib/space-id";
import { useWorkspaceStore } from "../../stores/workspaces";
import {
  BusyScreen,
  EmptyScreen,
  ErrorScreen,
} from "./local-model-dialog-parts";
import { LocalModelManualForm } from "./local-model-manual-form";
import { PickScreen } from "./local-model-pick";

interface Props {
  provider: ProviderInfo | null;
  onClose: () => void;
  onConnected?: (model: string) => void;
}

export function LocalModelDialog({ provider, onClose, onConnected }: Props) {
  const { t } = useTranslation("providers");
  const desktop = osIsTauri();
  const currentWorkspace = useWorkspaceStore((state) => state.current);
  const teamWorkspace = isTeamWorkspace(currentWorkspace?.id ?? "");
  const {
    mode,
    servers,
    selected,
    model,
    setModel,
    reasoning,
    setReasoning,
    shared,
    setShared,
    selectServer,
    runDetect,
    connect,
    cancel,
    goManual,
  } = useLocalModelConnect({
    active: provider != null,
    desktop,
    teamWorkspace,
    workspaceId: currentWorkspace?.id ?? "",
    onConnected,
    onClose,
  });

  if (!provider) return null;

  const isManual = mode === "manual";
  const title = isManual ? t("localModel.manual.title") : t("localModel.title");
  const description = isManual
    ? t("localModel.manual.description")
    : t("localModel.description");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode === "detecting" && (
          <BusyScreen
            title={t("localModel.detecting")}
            onCancel={cancel}
            cancelLabel={t("localModel.cancel")}
          />
        )}
        {mode === "empty" && (
          <EmptyScreen onRecheck={() => void runDetect()} onManual={goManual} />
        )}
        {mode === "pick" && (
          <PickScreen
            servers={servers}
            selected={selected}
            onSelectServer={selectServer}
            model={model}
            onSelectModel={setModel}
            reasoning={reasoning}
            onReasoningChange={setReasoning}
            shared={shared}
            onSharedChange={setShared}
            teamWorkspace={teamWorkspace}
            onConnect={() => void connect()}
            onManual={goManual}
          />
        )}
        {mode === "connecting" && (
          <BusyScreen
            title={t("localModel.connecting.title")}
            body={t("localModel.connecting.body")}
            onCancel={cancel}
            cancelLabel={t("localModel.cancel")}
          />
        )}
        {mode === "error" && (
          <ErrorScreen onRetry={() => void runDetect()} onManual={goManual} />
        )}
        {mode === "unsupported" && (
          <ErrorScreen
            body={t("localModel.unsupported.body")}
            onRetry={() => void connect()}
            onManual={goManual}
          />
        )}
        {isManual && (
          <LocalModelManualForm
            onConnected={onConnected}
            onClose={onClose}
            onBack={desktop ? () => void runDetect() : undefined}
            shared={shared}
            onSharedChange={setShared}
            teamWorkspace={teamWorkspace}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
