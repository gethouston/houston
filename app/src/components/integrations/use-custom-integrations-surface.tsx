import { Button, cn } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrationScope,
  useCustomIntegrationsFor,
  useCustomTransportAgentId,
  useStartCustomOAuth,
} from "../../hooks/queries";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import {
  CustomIntegrationDialogs,
  useCustomSelection,
} from "./custom-integration-dialogs";
import { CustomLoadErrorState } from "./custom-load-error-state";
import { CustomScopePicker } from "./custom-scope-picker";
import { CustomSetupBanner } from "./custom-setup-banner";
import { IntegrationSetupChat } from "./integration-setup-chat";
import { useIntegrationChatSetup } from "./use-integration-chat-setup";

export function useCustomIntegrationsSurface() {
  const scope = useCustomIntegrationScope();
  const transportAgentId = useCustomTransportAgentId();
  const list = useCustomIntegrationsFor(transportAgentId);
  const agents = useAgentStore((state) => state.agents);
  const surfaceActive =
    useUIStore((state) => state.viewMode) === INTEGRATIONS_VIEW_ID;
  const pickAgent = useUIStore((state) => state.setCustomIntegrationsAgentId);
  const chatSetup = useIntegrationChatSetup();
  const selection = useCustomSelection();
  const signIn = useStartCustomOAuth(transportAgentId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const startAdd = () => {
    const target = agents.length === 1 ? agents[0] : undefined;
    if (target) void chatSetup.start(target);
    else setPickerOpen(true);
  };
  // Per-agent scope (PRODUCT-1773): while the setup chat is open the list
  // already follows its agent (`resolveCustomTransportAgent`); the pick keeps
  // it there once the chat closes, so the finished row stays on screen.
  const startWith = (target: Agent) => {
    if (scope === "agent") pickAgent(target.id);
    void chatSetup.start(target);
  };

  const scopeAgent =
    scope === "agent"
      ? agents.find((agent) => agent.id === transportAgentId)
      : undefined;

  return {
    list,
    items: list.data,
    chatSetup,
    selection,
    signIn,
    startAdd,
    startWith,
    transportAgentId,
    agents,
    pickerOpen,
    setPickerOpen,
    surfaceActive,
    /** Where custom integrations live for this deployment. */
    scope,
    /** The agent whose list is shown (per-agent scope only). */
    scopeAgent,
    pickAgent,
  };
}

export type CustomIntegrationsSurface = ReturnType<
  typeof useCustomIntegrationsSurface
>;

/**
 * The agent pill beside the Add button, where the choice exists: a per-agent
 * deployment with more than one agent. Elsewhere it renders nothing — the
 * list is everyone's (shared host) or the only agent's.
 */
export function CustomScopeControl({
  surface,
  compact,
}: {
  surface: CustomIntegrationsSurface;
  compact: boolean;
}) {
  if (!surface.scopeAgent || surface.agents.length < 2) return null;
  return (
    <CustomScopePicker
      agents={surface.agents}
      selected={surface.scopeAgent}
      onSelect={surface.pickAgent}
      compact={compact}
    />
  );
}

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
          surface.startWith(target);
        }}
      />
      <CustomIntegrationDialogs
        selection={selection}
        agentId={surface.transportAgentId}
      />
    </>
  );
}
