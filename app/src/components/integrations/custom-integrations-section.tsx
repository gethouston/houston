import { Button, CatalogSearchField } from "@houston-ai/core";
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
import { CustomDeleteDialog } from "./custom-delete-dialog";
import { CustomEmptyState } from "./custom-empty-state";
import { CustomIntegrationRow } from "./custom-integration-row";
import { filterCustomIntegrations } from "./custom-integrations-model";
import { CustomKeyDialog } from "./custom-key-dialog";
import { CustomSetupBanner } from "./custom-setup-banner";
import { IntegrationSetupChat } from "./integration-setup-chat";
import { SectionHeader } from "./section-header";
import { useIntegrationChatSetup } from "./use-integration-chat-setup";

/**
 * Custom integrations (API / MCP servers the app catalog doesn't offer). Two
 * variants, one body: `"section"` (default) is the standalone block with its
 * own heading, embedded by the page's non-ready states; `"tab"` is the body of
 * the global page's Custom integrations tab, where the tab label already names
 * the surface, so the heading drops and a search field joins the Add button in
 * a controls row (mirroring the catalog tab's layout). Hidden ENTIRELY when the
 * host does not support the feature (`useCustomIntegrations` → `null`) or
 * before the list resolves; otherwise always visible so the empty state can
 * invite creation.
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
export function CustomIntegrationsSection({
  variant = "section",
}: {
  variant?: "section" | "tab";
}) {
  const { t } = useTranslation("integrations");
  const list = useCustomIntegrations();
  const remove = useRemoveCustomIntegration();
  const agents = useAgentStore((s) => s.agents);
  const chatSetup = useIntegrationChatSetup();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
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
  const visible = filterCustomIntegrations(items, query);
  // The tab with nothing in it and nothing in flight collapses to the pure
  // empty state: no controls, just the explanation + CTA. A live draft (open
  // chat or its banner) IS the in-progress add, so it takes the stage instead.
  const tabEmptyState =
    variant === "tab" &&
    items.length === 0 &&
    !chatSetup.open &&
    !chatSetup.hasDraft;

  // Outline, not filled: a filled pill here outweighed the page title and
  // pulled the flat page's one visual accent onto a side action.
  const addButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0 gap-1.5"
      disabled={chatSetup.pending}
      onClick={() => setPickerOpen(true)}
    >
      <Plus className="size-4" />
      {t("custom.addButton")}
    </Button>
  );

  return (
    <section>
      {variant === "tab" ? (
        items.length > 0 && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <CatalogSearchField
                value={query}
                onChange={setQuery}
                label={t("custom.searchPlaceholder")}
                className="flex-1"
              />
              {addButton}
            </div>
            <p className="mb-6 text-[13px] text-ink-muted">
              {t("custom.description")}
            </p>
          </>
        )
      ) : (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <SectionHeader title={t("custom.title")} count={items.length} />
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {t("custom.description")}
            </p>
          </div>
          {addButton}
        </div>
      )}

      {chatSetup.hasDraft && !chatSetup.open && activeAgent && (
        <CustomSetupBanner
          onDiscard={chatSetup.discard}
          onDone={chatSetup.finish}
          onContinue={() => chatSetup.openPanel(activeAgent.id)}
        />
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
        tabEmptyState ? (
          <CustomEmptyState
            onAdd={() => setPickerOpen(true)}
            pending={chatSetup.pending}
          />
        ) : (
          variant === "section" && (
            <p className="text-sm text-ink-muted">{t("custom.empty")}</p>
          )
        )
      ) : visible.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("custom.noResults")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
          {visible.map((integration) => (
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

      <CustomDeleteDialog
        integration={removeIntegration}
        onClose={() => setRemoveIntegration(null)}
        onConfirm={(integration) => remove.mutate(integration.slug)}
      />
    </section>
  );
}
