import { CatalogShell, type CatalogShellTab } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCustomIntegrations } from "../../../hooks/queries";
import {
  type ConnectFlow,
  CustomIntegrationsSection,
  type PermissionsFix,
} from "../../integrations";
import { CatalogControls } from "../../integrations-view/catalog-controls";
import { CatalogPane } from "../../integrations-view/catalog-pane";
import { InstalledStrip } from "../../integrations-view/installed-strip";
import { useCatalogSurface } from "../../integrations-view/use-catalog-surface";
import { AgentCatalogSections } from "./agent-catalog-sections";
import { AgentIntegrationsChrome } from "./agent-integrations-chrome";
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
 * ONE search + category controls row ({@link CatalogControls}) above both
 * sections filters the Installed strip and the catalog tab together. The catalog
 * tab is the shared {@link CatalogPane} (recovery rows, the grouped category
 * catalog with Teams locked rows), carrying the agent-only disallowed-apps
 * section as its `children`; a strip row opens the shared detail modal (view +
 * reconnect + disconnect, a pure connect surface, never a permission editor).
 * Connecting an app makes it usable for this agent (connection ∩ allowlist) via
 * `connectFlow`. Split out so the parent remounts it per agent (`key={agent.id}`),
 * keeping lifted state (tab, search, category, modals) from crossing agents.
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
  const [detailRow, setDetailRow] = useState<AgentAppRow | null>(null);
  const [disconnectRow, setDisconnectRow] = useState<AgentAppRow | null>(null);
  const custom = useCustomIntegrations();
  const customItems = custom.data ?? [];

  // Active rows fill the strip; pending/errored ones become catalog recovery rows.
  const active = useMemo(
    () => view.activeRows.filter((r) => r.connection.status === "active"),
    [view.activeRows],
  );
  const recovering = useMemo(
    () => view.activeRows.filter((r) => r.connection.status !== "active"),
    [view.activeRows],
  );
  // The ONE controls row's shared state (per-agent via remount): query +
  // category narrow the strip and the available count together.
  const {
    tab,
    setTab,
    query,
    setQuery,
    category,
    setCategory,
    filtering,
    shown,
    installedCount,
    availableCount,
  } = useCatalogSurface({
    active,
    custom: customItems,
    catalog,
    connections,
    allowlist,
  });

  const tabs: CatalogShellTab[] = [
    {
      value: "catalog",
      label: t("home.tabs.catalog"),
      count: connectableCount({ catalog, connections, allowlist }),
      content: (
        <CatalogPane
          catalog={catalog}
          connections={connections}
          query={query}
          category={category}
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
        controls={
          <CatalogControls
            catalog={catalog}
            connections={connections}
            query={query}
            onQueryChange={setQuery}
            category={category}
            onCategoryChange={setCategory}
          />
        }
        installedTitle={t("home.installedTitle")}
        installedCount={installedCount}
        installed={
          installedCount > 0 ? (
            <InstalledStrip
              active={shown.active}
              custom={shown.custom}
              searching={filtering}
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
        availableTitle={t("home.availableTitle")}
        // >1 tab: the tab chips carry the counts (no duplicate header chip).
        availableCount={tabs.length > 1 ? undefined : availableCount}
        tabs={tabs}
        value={tab}
        onValueChange={setTab}
      />

      <AgentIntegrationsChrome
        onManageAll={onManageAll}
        detailRow={detailRow}
        disconnectRow={disconnectRow}
        setDetailRow={setDetailRow}
        setDisconnectRow={setDisconnectRow}
        connectFlow={connectFlow}
        onDisconnect={onDisconnect}
      />
    </>
  );
}
