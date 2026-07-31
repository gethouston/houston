import { Button } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrationsFor,
  useCustomTransportAgentId,
} from "../../hooks/queries";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentPickerDialog } from "../agent-picker-dialog";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import { CustomEmptyState, CustomLoadErrorState } from "./custom-empty-state";
import {
  CustomIntegrationDialogs,
  useCustomSelection,
} from "./custom-integration-dialogs";
import { CustomIntegrationRow } from "./custom-integration-row";
import { filterCustomIntegrations } from "./custom-integrations-model";
import { CustomModeShell, CustomSectionChrome } from "./custom-section-chrome";
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
 * "Add custom integration" goes STRAIGHT to the guided setup chat (opened in
 * the shell-level RIGHT panel, the same panel the routine chat and the mission
 * board use, so this page stays visible) — the old choice dialog and its
 * manual typed form were cut. With an `agent` (the per-agent tab) the chat
 * starts with THAT agent; without one it starts with the workspace's only
 * agent, and only a multi-agent workspace asks which agent runs the interview
 * ({@link AgentPickerDialog}). Reads/writes ride the per-agent routes
 * (HOU-823) whenever a transport agent exists, so the surface keeps working
 * behind the hosted gateway (which proxies no top-level custom route). A
 * row's body opens the detail card (metadata, tool list, key + remove); the
 * trailing
 * actions stay one-click. All mutations route through `call()`, so failures
 * toast once and carry no local `onError`.
 */
export function CustomIntegrationsSection({
  variant = "section",
  agent,
  tabActive,
}: {
  variant?: "section" | "tab";
  agent?: Agent;
  /** Per-agent surface only: whether that tab owns the visible agent screen
   *  (TabProps.isActive). The global page derives visibility from `viewMode`
   *  itself. Needed because kept-alive views leave every section MOUNTED, and
   *  only the visible one may drive the shared shell chat panel. */
  tabActive?: boolean;
}) {
  const { t } = useTranslation("integrations");
  const transportAgentId = useCustomTransportAgentId(agent?.id);
  const list = useCustomIntegrationsFor(transportAgentId);
  const agents = useAgentStore((s) => s.agents);
  const viewMode = useUIStore((s) => s.viewMode);
  const surfaceActive = agent
    ? (tabActive ?? false)
    : viewMode === INTEGRATIONS_VIEW_ID;
  const chatSetup = useIntegrationChatSetup();
  const selection = useCustomSelection();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Straight to the setup chat — no fork dialog. The ambient agent (per-agent
  // tab) or a single-agent workspace resolves the target immediately; only a
  // multi-agent workspace on the global page needs the picker.
  const startAdd = () => {
    const target = agent ?? (agents.length === 1 ? agents[0] : undefined);
    if (target) void chatSetup.start(target);
    else setPickerOpen(true);
  };

  // A FAILED read renders loudly (error + retry): a transient 500 must never
  // be indistinguishable from a host without the feature — that one resolves
  // `null` and hides the section legitimately. Only when there is NOTHING to
  // show, though: a failed BACKGROUND refetch keeps the last good list on
  // screen (an error panel over N live rows would erase the surface the same
  // way the silent degrade would).
  if (list.isError && list.data === undefined) {
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
      onClick={startAdd}
    >
      <Plus className="size-4" />
      {t("custom.addButton")}
    </Button>
  );

  const rowsGrid = (
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
  );

  return (
    <section>
      {variant === "section" && (
        <CustomSectionChrome count={items.length} addButton={addButton} />
      )}

      {chatSetup.hasDraft && !chatSetup.open && activeAgent && (
        <CustomSetupBanner
          onDiscard={chatSetup.discard}
          onDone={chatSetup.finish}
          onContinue={() => chatSetup.openPanel(activeAgent.id)}
        />
      )}

      {/* The setup chat opens in the shell-level RIGHT panel (the routines
          look): the agent runs the interview beside this page, which stays
          visible on the left — no board navigation, no view switch. */}
      {chatSetup.open && activeAgent && (
        <IntegrationSetupChat
          agent={activeAgent}
          agentDef={chatSetup.activeAgentDef}
          activity={chatSetup.draftActivity}
          active={surfaceActive}
          onClose={chatSetup.closePanel}
          onDone={chatSetup.finish}
        />
      )}

      {items.length === 0 ? (
        tabEmptyState ? (
          <CustomEmptyState onAdd={startAdd} pending={chatSetup.pending} />
        ) : (
          variant === "section" && (
            <p className="text-sm text-ink-muted">{t("custom.empty")}</p>
          )
        )
      ) : variant === "tab" ? (
        // The Custom MODE (HOU-980 review): the same shell grammar as the
        // Composio mode — this mode's search + Add over an Installed card.
        <>
          <CustomModeShell
            query={query}
            onQueryChange={setQuery}
            addButton={addButton}
            count={visible.length}
          >
            {rowsGrid}
          </CustomModeShell>
          {visible.length === 0 && (
            <p className="text-sm text-ink-muted">{t("custom.noResults")}</p>
          )}
        </>
      ) : visible.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("custom.noResults")}</p>
      ) : (
        rowsGrid
      )}

      <AgentPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        agents={agents}
        onPick={(target) => {
          setPickerOpen(false);
          void chatSetup.start(target);
        }}
      />

      <CustomIntegrationDialogs
        selection={selection}
        agentId={transportAgentId}
      />
    </section>
  );
}
