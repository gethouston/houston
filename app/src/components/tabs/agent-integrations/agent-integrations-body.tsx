import { CatalogShell, type CatalogShellTab } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCustomIntegrations } from "../../../hooks/queries";
import {
  AppDetailDialog,
  type ConnectFlow,
  CustomIntegrationsSection,
  IntegrationDisconnectDialog,
} from "../../integrations";
import { CatalogPane } from "../../integrations-view/catalog-pane";
import { InstalledStrip } from "../../integrations-view/installed-strip";
import { AgentDisallowedAppsSection } from "./agent-disallowed-apps-section";
import {
  type AgentAppRow,
  type AgentIntegrationsView,
  connectableCount,
} from "./model";

interface AgentIntegrationsBodyProps {
  view: AgentIntegrationsView;
  canEdit: boolean;
  /** The full toolkit catalog (drives the category filter + browse list). */
  catalog: IntegrationToolkit[];
  /** The effective Teams allowlist (`null` = unrestricted). Apps outside it show
   *  as locked rows in the browse catalog rather than being hidden. */
  allowlist: string[] | null;
  /** The account's connections, so browse can hide already-connected apps. */
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  /** The catalog is still fetching (browse shows a loader, not "no apps"). */
  catalogLoading: boolean;
  onDisconnect: (toolkit: string) => void;
  /** The bottom link's destination. When the caller can see the global
   *  Integrations page it jumps there ("Manage all integrations"); a Teams plain
   *  member (page gone) is sent to Settings > Connected accounts instead. The
   *  boolean only picks the copy — `onManageAll` already performs the routing. */
  canSeePolicyPage: boolean;
  /** Perform the bottom-link navigation chosen by {@link canSeePolicyPage}. */
  onManageAll: () => void;
}

/**
 * The resolved body of the per-agent Integrations tab — the SAME catalog
 * layout as the global Integrations page, minus its page header (the tab label
 * already says Integrations): the consolidated Installed strip (this agent's
 * usable apps + the custom integrations) OUTSIDE the tabs, then the
 * Integrations / Custom integrations tabs via the shared {@link CatalogShell}.
 * The catalog tab is the shared {@link CatalogPane} (search + A-Z category
 * combobox, recovery rows, the grouped category catalog with Teams locked
 * rows), carrying the agent-only disallowed-apps section as its `children`. A
 * strip tile opens the shared detail modal (view + reconnect + disconnect —
 * grant editing lives in Settings > Connected accounts, so this tab stays a
 * pure connect surface); connect auto-grants to this agent via the surface's
 * `connectFlow`. Split out of {@link IntegrationsTab} so the parent can
 * remount it per agent with `key={agent.id}` — all lifted view state (tab,
 * search, category, open modals) lives here so none of it crosses agents.
 */
export function AgentIntegrationsBody({
  view,
  canEdit,
  catalog,
  allowlist,
  connections,
  connectFlow,
  catalogLoading,
  onDisconnect,
  canSeePolicyPage,
  onManageAll,
}: AgentIntegrationsBodyProps) {
  const { t } = useTranslation("integrations");
  const [tab, setTab] = useState("catalog");
  const [detailRow, setDetailRow] = useState<AgentAppRow | null>(null);
  const [disconnectRow, setDisconnectRow] = useState<AgentAppRow | null>(null);
  const custom = useCustomIntegrations();
  const customItems = custom.data ?? [];

  // The agent's usable apps: active ones tile the strip; pending / errored
  // ones surface as recovery rows inside the catalog tab.
  const usable = view.mode === "grants" ? view.activeRows : view.rows;
  const active = useMemo(
    () => usable.filter((r) => r.connection.status === "active"),
    [usable],
  );
  const recovering = useMemo(
    () => usable.filter((r) => r.connection.status !== "active"),
    [usable],
  );
  const disallowed = view.mode === "grants" ? view.disallowedRows : [];
  const installedCount = active.length + customItems.length;

  const tabs: CatalogShellTab[] = [
    {
      value: "catalog",
      label: t("home.tabs.catalog"),
      count: connectableCount({ catalog, connections, allowlist }),
      content: (
        <CatalogPane
          catalog={catalog}
          connections={connections}
          recovering={recovering}
          isLoading={catalogLoading}
          connectFlow={connectFlow}
          onRemoveRecovering={onDisconnect}
          allowlist={allowlist}
          readOnly={!canEdit}
        >
          {disallowed.length > 0 && (
            <AgentDisallowedAppsSection rows={disallowed} />
          )}
        </CatalogPane>
      ),
    },
    ...(custom.data !== null
      ? [
          {
            value: "custom",
            label: t("home.tabs.custom"),
            count: custom.data?.length,
            content: <CustomIntegrationsSection variant="tab" />,
          },
        ]
      : []),
  ];

  return (
    <>
      <CatalogShell
        installedTitle={t("home.installedTitle")}
        installedCount={installedCount}
        installed={
          installedCount > 0 ? (
            <InstalledStrip
              active={active}
              custom={customItems}
              onOpen={(connection) => {
                const row = active.find(
                  (r) => r.connection.connectionId === connection.connectionId,
                );
                if (row) setDetailRow(row);
              }}
              onOpenCustom={() => setTab("custom")}
            />
          ) : undefined
        }
        tabs={tabs}
        value={tab}
        onValueChange={setTab}
      />

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={onManageAll}
          className="text-xs text-ink-muted underline underline-offset-4 decoration-dotted transition-colors hover:text-ink"
        >
          {canSeePolicyPage
            ? t("agentTab.manageAll")
            : t("policyPage.manageAccounts")}
        </button>
      </div>

      {detailRow && (
        <AppDetailDialog
          open
          onOpenChange={(open) => {
            if (!open) setDetailRow(null);
          }}
          display={detailRow.app}
          connection={detailRow.connection}
          onReconnect={() => {
            void connectFlow.connect(detailRow.connection.toolkit);
            setDetailRow(null);
          }}
          onDisconnect={() => {
            setDisconnectRow(detailRow);
            setDetailRow(null);
          }}
        />
      )}

      <IntegrationDisconnectDialog
        app={disconnectRow?.app ?? null}
        scope="everywhere"
        onClose={() => setDisconnectRow(null)}
        onConfirm={(toolkit) => {
          onDisconnect(toolkit);
          setDisconnectRow(null);
        }}
      />
    </>
  );
}
