import { Button, cn } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrationsFor,
  useCustomTransportAgentId,
  useStartCustomOAuth,
} from "../../hooks/queries";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import {
  CustomIntegrationDialogs,
  useCustomSelection,
} from "./custom-integration-dialogs";
import { CustomLoadErrorState } from "./custom-load-error-state";
import { CustomSetupBanner } from "./custom-setup-banner";
import { IntegrationSetupChat } from "./integration-setup-chat";
import { useIntegrationChatSetup } from "./use-integration-chat-setup";

export function useCustomIntegrationsSurface() {
  const transportAgentId = useCustomTransportAgentId();
  const list = useCustomIntegrationsFor(transportAgentId);
  const agents = useAgentStore((state) => state.agents);
  const surfaceActive =
    useUIStore((state) => state.viewMode) === INTEGRATIONS_VIEW_ID;
  const chatSetup = useIntegrationChatSetup();
  const selection = useCustomSelection();
  const signIn = useStartCustomOAuth(transportAgentId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const startAdd = () => {
    const target = agents.length === 1 ? agents[0] : undefined;
    if (target) void chatSetup.start(target);
    else setPickerOpen(true);
  };

  return {
    list,
    items: list.data,
    chatSetup,
    selection,
    signIn,
    startAdd,
    transportAgentId,
    agents,
    pickerOpen,
    setPickerOpen,
    surfaceActive,
  };
}

export type CustomIntegrationsSurface = ReturnType<
  typeof useCustomIntegrationsSurface
>;

export function AddCustomButton({
  surface,
  compact,
}: {
  surface: CustomIntegrationsSurface;
  compact: boolean;
}) {
  const { t } = useTranslation("integrations");
  return (
    <Button
      type="button"
      size="sm"
      className={cn("shrink-0 gap-1.5", compact && "h-8")}
      disabled={surface.chatSetup.pending}
      onClick={surface.startAdd}
    >
      <Plus className="size-4" />
      {t("custom.addButton")}
    </Button>
  );
}

export function CustomSurfaceSupport({
  surface,
}: {
  surface: CustomIntegrationsSurface;
}) {
  const { list, chatSetup, selection } = surface;
  if (list.isError && list.data === undefined) {
    return <CustomLoadErrorState onRetry={() => void list.refetch()} />;
  }
  if (!Array.isArray(list.data)) return null;
  const { activeAgent } = chatSetup;
  return (
    <>
      {chatSetup.hasDraft && !chatSetup.open && activeAgent && (
        <CustomSetupBanner
          onDiscard={chatSetup.discard}
          onDone={chatSetup.finish}
          onContinue={() => chatSetup.openPanel(activeAgent.id)}
        />
      )}
      {chatSetup.open && activeAgent && (
        <IntegrationSetupChat
          agent={activeAgent}
          activity={chatSetup.draftActivity}
          active={surface.surfaceActive}
          onClose={chatSetup.closePanel}
          onDone={chatSetup.finish}
        />
      )}
      <AgentPickerDialog
        open={surface.pickerOpen}
        onOpenChange={surface.setPickerOpen}
        agents={surface.agents}
        onPick={(target) => {
          surface.setPickerOpen(false);
          void chatSetup.start(target);
        }}
      />
      <CustomIntegrationDialogs
        selection={selection}
        agentId={surface.transportAgentId}
      />
    </>
  );
}
