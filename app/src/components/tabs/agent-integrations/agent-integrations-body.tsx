import { CatalogShell } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCustomIntegrationsFor } from "../../../hooks/queries";
import type { Agent } from "../../../lib/types";
import type { ConnectFlow, PermissionsFix } from "../../integrations";
import { CatalogControls } from "../../integrations-view/catalog-controls";
import {
  CatalogBrowsePane,
  CatalogModeTabs,
} from "../../integrations-view/catalog-mode-tabs";
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
  /** The agent this tab belongs to: the custom-integration reads/writes ride
   *  its per-agent routes (HOU-823) and the setup chat starts with it. */
  agent: Agent;
  /** Whether this mounted tab owns the visible agent surface (TabProps) —
   *  gates the setup chat's shared shell panel. */
  tabActive: boolean;
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
 * The resolved body of the per-agent Integrations tab — the SAME layout as
 * the global Integrations page, minus its page header (the tab label already
 * says Integrations): the page-level source toggle ({@link CatalogModeTabs},
 * one source at a time), whose Composio mode is the shared
 * {@link CatalogShell} — ONE search + category controls row over this agent's
 * Installed strip and the browse catalog ({@link CatalogBrowsePane}, with
 * Teams locked rows and the agent-only disallowed-apps section as its
 * `children`) — and whose Custom mode is the shared section with ITS
 * installed list up top. A strip row opens the shared detail modal (view +
 * reconnect + disconnect, a pure connect surface, never a permission editor).
 * Connecting an app makes it usable for this agent (connection ∩ allowlist)
 * via `connectFlow`. Split out so the parent remounts it per agent
 * (`key={agent.id}`), keeping lifted state (mode, search, category, modals)
 * from crossing agents.
 */
export function AgentIntegrationsBody({
  agent,
  tabActive,
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
    catalog,
    connections,
    allowlist,
  });

  return (
    <>
      <CatalogModeTabs
        mode={tab}
        onModeChange={setTab}
        catalogCount={
          catalogLoading
            ? undefined
            : connectableCount({ catalog, connections, allowlist })
        }
        customData={custom.data}
        customListFailed={custom.isError}
        agent={agent}
        tabActive={tabActive}
      >
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
                searching={filtering}
                onOpen={(connection) => {
                  const row = active.find(
                    (r) =>
                      r.connection.connectionId === connection.connectionId,
                  );
                  if (row) setDetailRow(row);
                }}
              />
            ) : undefined
          }
          availableTitle={t("home.availableTitle")}
          availableCount={availableCount}
          tabs={[
            {
              value: "catalog",
              label: t("home.tabs.catalog"),
              content: (
                <CatalogBrowsePane
                  catalog={catalog}
                  connections={connections}
                  surface={surface}
                  query={query}
                  setQuery={setQuery}
                  category={category}
                  isLoading={catalogLoading}
                  connectFlow={connectFlow}
                  onRemove={onDisconnect}
                  allowlist={allowlist}
                  lockedFix={permissionsFix}
                >
                  <AgentCatalogSections
                    view={view}
                    permissionsFix={permissionsFix}
                  />
                </CatalogBrowsePane>
              ),
            },
          ]}
        />
      </CatalogModeTabs>

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
