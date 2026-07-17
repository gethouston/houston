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
  type PermissionsFix,
} from "../../integrations";
import { CatalogPane } from "../../integrations-view/catalog-pane";
import { InstalledStrip } from "../../integrations-view/installed-strip";
import { AgentCatalogSections } from "./agent-catalog-sections";
import {
  type AgentAppRow,
  type AgentIntegrationsView,
  connectableCount,
} from "./model";

interface AgentIntegrationsBodyProps {
  view: AgentIntegrationsView;
  /** This agent's id, for the approved-actions review + connect flow. */
  agentId: string;
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
  /** Navigate to the global Integrations page ("Manage all integrations"). */
  onManageAll: () => void;
  /** Role-aware "Enable it in Permissions" resolver for policy-blocked apps
   *  (locked browse rows + the disallowed section); absent = the member view. */
  permissionsFix?: PermissionsFix;
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
 * this tab is a pure connect surface, never a permission editor); connecting an
 * app makes it usable for this agent (connection ∩ allowlist) via the surface's
 * `connectFlow`. Split out of {@link IntegrationsTab} so the parent can
 * remount it per agent with `key={agent.id}` — all lifted view state (tab,
 * search, category, open modals) lives here so none of it crosses agents.
 */
export function AgentIntegrationsBody({
  view,
  agentId,
  catalog,
  allowlist,
  connections,
  connectFlow,
  catalogLoading,
  onDisconnect,
  onManageAll,
  permissionsFix,
}: AgentIntegrationsBodyProps) {
  const { t } = useTranslation("integrations");
  const [tab, setTab] = useState("catalog");
  const [detailRow, setDetailRow] = useState<AgentAppRow | null>(null);
  const [disconnectRow, setDisconnectRow] = useState<AgentAppRow | null>(null);
  const custom = useCustomIntegrations();
  const customItems = custom.data ?? [];

  // The agent's usable apps: active ones tile the strip; pending / errored
  // ones surface as recovery rows inside the catalog tab.
  const usable = view.activeRows;
  const active = useMemo(
    () => usable.filter((r) => r.connection.status === "active"),
    [usable],
  );
  const recovering = useMemo(
    () => usable.filter((r) => r.connection.status !== "active"),
    [usable],
  );
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
          lockedFix={permissionsFix}
        >
          <AgentCatalogSections
            view={view}
            agentId={agentId}
            catalog={catalog}
            permissionsFix={permissionsFix}
          />
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
          {t("agentTab.manageAll")}
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
        onClose={() => setDisconnectRow(null)}
        onConfirm={(toolkit) => {
          onDisconnect(toolkit);
          setDisconnectRow(null);
        }}
      />
    </>
  );
}
