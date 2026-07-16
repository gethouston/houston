import { CatalogShell, type CatalogShellTab } from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCustomIntegrations,
  useDisconnectIntegration,
} from "../../hooks/queries";
import {
  CustomIntegrationsSection,
  INTEGRATION_PROVIDER,
  ReconnectBanner,
  useConnectedApps,
  useConnectFlow,
  useConnectionSelection,
} from "../integrations";
import { PageHeader } from "../shell/page-shell";
import { CatalogPane } from "./catalog-pane";
import { ConnectedAppDialogs } from "./connected-app-dialogs";
import { InstalledStrip } from "./installed-strip";

interface IntegrationsReadyProps {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
}

/**
 * The ready state of the global Integrations page (personal mode): a hero
 * title + muted subtitle over the {@link CatalogShell} layout —
 *
 *  1. the consolidated **Installed** strip (active catalog connections AND
 *     custom integrations — it belongs to both sources, so it sits OUTSIDE
 *     the tabs and never changes when the user switches), then
 *  2. two discovery tabs: **Integrations** (the app catalog:
 *     {@link CatalogPane} with its search + category combobox and recovery
 *     rows) and **Custom integrations** (the API / MCP surface with its own
 *     search + Add controls row). When the host doesn't serve custom
 *     integrations the shell renders the catalog alone, no tab chrome.
 *
 * Each tab owns its search; discovery controls live INSIDE the surface they
 * filter. A custom tile in the strip jumps to the Custom tab (its row holds
 * the status / key / remove affordances); a catalog tile opens the detail
 * MODAL (`AppDetailDialog`, the same `CatalogDetailDialog` the browse rows use
 * — never a slideover): view + reconnect + disconnect for that personal
 * connection. Which agents may use an app is managed in one place (the
 * Permissions view), never here. ONE connect flow lives here (connect-only) and
 * is handed to the catalog, the recovery rows, and the detail modal so closing
 * any of them, or switching tabs, never kills an in-flight OAuth poll.
 *
 * The catalog shows the FULL Houston catalog. Policy is per agent only (the
 * org-wide app ceiling was removed), so the global page has no ceiling to apply
 * and never locks a row — locked browse rows live only on the per-agent
 * Integrations tab, keyed to that agent's ceiling.
 */
export function IntegrationsReady({
  reconnectNotice,
  dismissReconnect,
}: IntegrationsReadyProps) {
  const { t } = useTranslation("integrations");
  const [tab, setTab] = useState("catalog");
  const apps = useConnectedApps();
  const connectFlow = useConnectFlow({});
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const custom = useCustomIntegrations();
  const selection = useConnectionSelection(apps);

  // `null` = the host doesn't serve custom integrations: no Custom tab (the
  // shell drops the tab chrome), no custom tiles in the strip.
  const customItems = custom.data ?? [];
  // The catalog tab's count chip: the connectable apps (connected excluded,
  // exactly what the tab browses). Hidden while the catalog settles.
  const connectableCount = useMemo(() => {
    const connected = new Set(apps.connData.map((c) => c.toolkit));
    return apps.catalogData.filter((tk) => !connected.has(tk.slug)).length;
  }, [apps.catalogData, apps.connData]);
  const tabs: CatalogShellTab[] = [
    {
      value: "catalog",
      label: t("home.tabs.catalog"),
      count: apps.isLoading ? undefined : connectableCount,
      content: (
        <CatalogPane
          catalog={apps.catalogData}
          connections={apps.connData}
          recovering={apps.recoveringRows}
          isLoading={apps.isLoading}
          connectFlow={connectFlow}
          onRemoveRecovering={(toolkit) => disconnect.mutate(toolkit)}
        />
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
  const installedCount = apps.activeRows.length + customItems.length;

  return (
    <>
      <PageHeader
        title={t("home.title")}
        subtitle={t("home.description")}
        className="mb-7"
      />

      {reconnectNotice && (
        <div className="mb-4">
          <ReconnectBanner onDismiss={dismissReconnect} />
        </div>
      )}

      <CatalogShell
        installedTitle={t("home.installedTitle")}
        installedCount={apps.isLoading ? undefined : installedCount}
        installed={
          apps.isLoading ? (
            <InstalledSkeleton />
          ) : installedCount > 0 ? (
            <InstalledStrip
              active={apps.activeRows}
              custom={customItems}
              onOpen={selection.openConn}
              onOpenCustom={() => setTab("custom")}
            />
          ) : undefined
        }
        tabs={tabs}
        value={tab}
        onValueChange={setTab}
      />

      <ConnectedAppDialogs
        selection={selection}
        connectFlow={connectFlow}
        onRemove={(toolkit) => disconnect.mutate(toolkit)}
      />
    </>
  );
}

/** A tile-row placeholder while the connections settle. Decorative only. */
function InstalledSkeleton() {
  return (
    <div aria-hidden className="flex gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="size-12 animate-pulse rounded-xl bg-chip" />
      ))}
    </div>
  );
}
