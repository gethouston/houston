import { CatalogShell } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCustomIntegrationsFor } from "../../../hooks/queries";
import type { Agent } from "../../../lib/types";
import {
  type ConnectFlow,
  CustomIntegrationDialogs,
  type PermissionsFix,
  useCustomSelection,
} from "../../integrations";
import { CatalogControls } from "../../integrations-view/catalog-controls";
import { InstalledStrip } from "../../integrations-view/installed-strip";
import { useCatalogSurface } from "../../integrations-view/use-catalog-surface";
import { useCatalogTabs } from "../../integrations-view/use-catalog-tabs";
import { AgentCatalogSections } from "./agent-catalog-sections";
import { AgentIntegrationsChrome } from "./agent-integrations-chrome";
import {
  type AgentAppRow,
  type AgentIntegrationsView,
  connectableCount,
} from "./model";

interface AgentIntegrationsBodyProps {
  /** The agent this tab belongs to: the custom-integration reads/writes ride
   *  its per-agent routes (HOU-823) and the setup chat starts with it. */
  agent: Agent;
  view: AgentIntegrationsView;
  /** The full toolkit catalog (drives the category filter + browse list). */
  catalog: IntegrationToolkit[];
  /** The effective Teams allowlist (`null` = unrestricted). Apps outside it show
   *  as locked rows in the browse catalog rather than being hidden. */
  allowlist: string[] | null;
  /** The account's connections, so browse can hide already-connected apps. */
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  /** This surface's half of every catalog row's connect-flow origin key, so an
   *  agent tab's rows are never confused with the global page's. */
  surface: string;
  /** The catalog is still fetching (browse shows a loader, not "no apps"). */
  catalogLoading: boolean;
  /** `connectionId` narrows the removal to ONE account of the toolkit (the
   *  detail dialog's per-account disconnect); omitted removes them all. */
  onDisconnect: (toolkit: string, connectionId?: string) => void;
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
 * tab is the shared {@link CatalogPane} (the grouped category catalog with Teams
 * locked rows, and the rows of any app whose connection needs finishing),
 * carrying the agent-only disallowed-apps
 * section as its `children`; a strip row opens the shared detail modal (view +
 * reconnect + disconnect, a pure connect surface, never a permission editor).
 * Connecting an app makes it usable for this agent (connection ∩ allowlist) via
 * `connectFlow`. Split out so the parent remounts it per agent (`key={agent.id}`),
 * keeping lifted state (tab, search, category, modals) from crossing agents.
 */
export function AgentIntegrationsBody({
  agent,
  view,
  catalog,
  allowlist,
  connections,
  connectFlow,
  surface,
  catalogLoading,
  onDisconnect,
  onManageAll,
  permissionsFix,
}: AgentIntegrationsBodyProps) {
  const { t } = useTranslation("integrations");
  const [detailRow, setDetailRow] = useState<AgentAppRow | null>(null);
  const [disconnectRow, setDisconnectRow] = useState<AgentAppRow | null>(null);
  // Per-agent form (HOU-823): the ONE custom surface a gateway proxies to the
  // pod, so this tab keeps working on managed cloud (top-level 404s there).
  const custom = useCustomIntegrationsFor(agent.id);
  const customItems = custom.data ?? [];
  const customSelection = useCustomSelection();

  // Only WORKING connections fill the strip; an app whose connection is pending
  // or errored stays in the catalog below, in its own category rows.
  const active = useMemo(
    () => view.activeRows.filter((r) => r.connection.status === "active"),
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

  const tabs = useCatalogTabs({
    catalog,
    connections,
    surface,
    query,
    setQuery,
    category,
    isLoading: catalogLoading,
    connectFlow,
    onRemove: onDisconnect,
    catalogCount: connectableCount({ catalog, connections, allowlist }),
    customData: custom.data,
    customListFailed: custom.isError,
    agent,
    allowlist,
    lockedFix: permissionsFix,
    children: (
      <AgentCatalogSections view={view} permissionsFix={permissionsFix} />
    ),
  });
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
              onOpenCustom={(integration) =>
                customSelection.openDetail(integration.slug)
              }
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

      {/* An Installed-strip custom tile opens its detail card right here (the
          section inside the Custom tab has its own instance for row clicks). */}
      <CustomIntegrationDialogs
        selection={customSelection}
        agentId={agent.id}
      />
    </>
  );
}
