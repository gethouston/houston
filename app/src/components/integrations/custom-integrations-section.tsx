import { Button } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCustomIntegrationsFor } from "../../hooks/queries";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { CustomAddDialog } from "./custom-add-dialog";
import { CustomEmptyState, CustomLoadErrorState } from "./custom-empty-state";
import {
  CustomIntegrationDialogs,
  useCustomSelection,
} from "./custom-integration-dialogs";
import { CustomIntegrationRow } from "./custom-integration-row";
import { filterCustomIntegrations } from "./custom-integrations-model";
import { CustomSectionChrome } from "./custom-section-chrome";
import { CustomSetupBanner } from "./custom-setup-banner";
import { IntegrationSetupChat } from "./integration-setup-chat";
import { useIntegrationChatSetup } from "./use-integration-chat-setup";

/**
 * Custom integrations (API / MCP servers the app catalog doesn't offer). Two
 * variants, one body: `"section"` (default) is the standalone block with its
 * own heading, embedded by the page's non-ready states; `"tab"` is the body of
 * the Custom integrations tab on the global page AND the per-agent tab. Hidden
 * ENTIRELY when the host does not support the feature (list → `null`) or
 * before the list resolves; otherwise always visible so the empty state can
 * invite creation.
 *
 * "Add custom integration" opens the {@link CustomAddDialog} fork: the guided
 * setup chat (EMBEDDED right here, same pattern as the routine setup chat) or
 * the manual typed form. With an `agent` (the per-agent tab) every read/write
 * rides the per-agent routes (HOU-823) and the chat starts with THAT agent;
 * without one the chat path goes through the agent picker first. A row's body
 * opens the detail card (metadata, tool list, key + remove); the trailing
 * actions stay one-click. All mutations route through `call()`, so failures
 * toast once and carry no local `onError`.
 */
export function CustomIntegrationsSection({
  variant = "section",
  agent,
}: {
  variant?: "section" | "tab";
  agent?: Agent;
}) {
  const { t } = useTranslation("integrations");
  const list = useCustomIntegrationsFor(agent?.id);
  const agents = useAgentStore((s) => s.agents);
  const addToast = useUIStore((s) => s.addToast);
  const chatSetup = useIntegrationChatSetup();
  const selection = useCustomSelection();

  const [addOpen, setAddOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const startChat = (target: Agent) => {
    setAddOpen(false);
    setPickerOpen(false);
    void chatSetup.start(target);
  };

  // A FAILED read renders loudly (error + retry): a transient 500 must never
  // be indistinguishable from a host without the feature — that one resolves
  // `null` and hides the section legitimately.
  if (list.isError) {
    return <CustomLoadErrorState onRetry={() => void list.refetch()} />;
  }

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
      onClick={() => setAddOpen(true)}
    >
      <Plus className="size-4" />
      {t("custom.addButton")}
    </Button>
  );

  return (
    <section>
      <CustomSectionChrome
        variant={variant}
        count={items.length}
        query={query}
        onQueryChange={setQuery}
        addButton={addButton}
      />

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
            onAdd={() => setAddOpen(true)}
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
              onOpen={(i) => selection.openDetail(i.slug)}
              onEnterKey={(i) => selection.openKey(i.slug)}
              onRemove={(i) => selection.openRemove(i.slug)}
            />
          ))}
        </div>
      )}

      <CustomAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        agentId={agent?.id}
        onStartChat={() => {
          if (agent) startChat(agent);
          else {
            setAddOpen(false);
            setPickerOpen(true);
          }
        }}
        onAdded={(view) => {
          setAddOpen(false);
          if (view.state.status === "pending") selection.openKey(view.slug);
          else
            addToast({
              title: t("custom.add.addedToast", { name: view.name }),
              variant: "success",
            });
        }}
      />

      <AgentPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        agents={agents}
        onPick={startChat}
      />

      <CustomIntegrationDialogs selection={selection} agentId={agent?.id} />
    </section>
  );
}
