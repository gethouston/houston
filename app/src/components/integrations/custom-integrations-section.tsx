import { Button, ConfirmDialog } from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrations,
  useRemoveCustomIntegration,
} from "../../hooks/queries";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { CustomIntegrationRow } from "./custom-integration-row";
import { CustomKeyDialog } from "./custom-key-dialog";
import { IntegrationSetupChat } from "./integration-setup-chat";
import { useIntegrationChatSetup } from "./use-integration-chat-setup";

/**
 * The "Custom integrations" section of the global Integrations page (API / MCP
 * servers the app catalog doesn't offer). Hidden ENTIRELY when the host does not
 * support the feature (`useCustomIntegrations` → `null`) or before the list
 * resolves; otherwise always visible so the empty state can invite creation.
 *
 * "Add custom integration" picks an agent, then opens a guided setup chat
 * EMBEDDED right here (the same pattern as the routine setup chat) — an agent
 * runs the interview (which service, its URL, keys via `request_credential`)
 * with no board navigation and no view switch (see {@link
 * useIntegrationChatSetup} + {@link IntegrationSetupChat}). While a draft chat
 * exists it surfaces as a Continue-setup banner. Each row can enter a pending
 * integration's key (a secure dialog) or remove it (confirm-gated). All
 * mutations route through `call()`, so failures toast once and carry no local
 * `onError`.
 */
export function CustomIntegrationsSection() {
  const { t } = useTranslation("integrations");
  const list = useCustomIntegrations();
  const remove = useRemoveCustomIntegration();
  const agents = useAgentStore((s) => s.agents);
  const chatSetup = useIntegrationChatSetup();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyIntegration, setKeyIntegration] =
    useState<CustomIntegrationView | null>(null);
  const [removeIntegration, setRemoveIntegration] =
    useState<CustomIntegrationView | null>(null);

  const onPickAgent = (agent: Agent) => {
    setPickerOpen(false);
    void chatSetup.start(agent);
  };

  // `null` = unsupported host (hide the whole section); `undefined` = still
  // loading (nothing to show yet). Only a resolved array renders the section.
  const items = list.data;
  if (!items) return null;

  const { activeAgent } = chatSetup;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">{t("custom.title")}</h3>
          <p className="text-[13px] text-ink-muted">
            {t("custom.description")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={chatSetup.pending}
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="size-4" />
          {t("custom.addButton")}
        </Button>
      </div>

      {/* A draft setup chat is in progress but its panel is closed: invite the
          user back into it (or let them discard it). Always-visible buttons,
          never a hover-only affordance. */}
      {chatSetup.hasDraft && !chatSetup.open && activeAgent && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-chip px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              {t("custom.setupChat.bannerTitle")}
            </p>
            <p className="text-xs text-ink/70">
              {t("custom.setupChat.bannerDescription")}
            </p>
          </div>
          <Button variant="ghost" onClick={chatSetup.discard}>
            {t("custom.setupChat.discard")}
          </Button>
          <Button variant="outline" onClick={chatSetup.finish}>
            {t("custom.setupChat.done")}
          </Button>
          <Button onClick={() => chatSetup.openPanel(activeAgent.id)}>
            {t("custom.setupChat.continue")}
          </Button>
        </div>
      )}

      {/* The setup chat lives INLINE right here while open — an agent runs the
          interview without any board navigation or view switch. */}
      {chatSetup.open && activeAgent && (
        <IntegrationSetupChat
          agent={activeAgent}
          agentDef={chatSetup.activeAgentDef}
          activity={chatSetup.draftActivity}
          onClose={chatSetup.closePanel}
          onDone={chatSetup.finish}
        />
      )}

      {items.length === 0 ? (
        <p className="rounded-xl bg-chip px-6 py-8 text-center text-sm text-ink-muted">
          {t("custom.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((integration) => (
            <CustomIntegrationRow
              key={integration.slug}
              integration={integration}
              onEnterKey={setKeyIntegration}
              onRemove={setRemoveIntegration}
            />
          ))}
        </div>
      )}

      <AgentPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        agents={agents}
        onPick={onPickAgent}
      />

      <CustomKeyDialog
        integration={keyIntegration}
        onClose={() => setKeyIntegration(null)}
      />

      <ConfirmDialog
        open={removeIntegration !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveIntegration(null);
        }}
        title={t("custom.delete.title", {
          name: removeIntegration?.name ?? "",
        })}
        description={t("custom.delete.description", {
          name: removeIntegration?.name ?? "",
        })}
        confirmLabel={t("custom.delete.confirm")}
        cancelLabel={t("custom.delete.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (removeIntegration) remove.mutate(removeIntegration.slug);
          setRemoveIntegration(null);
        }}
      />
    </section>
  );
}
