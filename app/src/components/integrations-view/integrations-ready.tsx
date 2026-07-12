import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../hooks/queries";
import {
  AppDetailSheet,
  CustomIntegrationsSection,
  DisconnectAppDialog,
  INTEGRATION_PROVIDER,
  ReconnectBanner,
  SectionHeader,
  useConnectedApps,
  useConnectFlow,
  useConnectionSelection,
} from "../integrations";
import { PageHeader } from "../shell/page-shell";
import { CatalogSearchField } from "./catalog-search-field";
import { CategoryCatalog } from "./category-catalog";
import { InstalledStrip } from "./installed-strip";
import { RecoveryRow } from "./recovery-row";

interface IntegrationsReadyProps {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
}

/**
 * The ready state of the global Integrations page (personal mode) as the flat,
 * airy "plane": a hero title + muted subtitle with the rounded catalog search in
 * the header's trailing slot, then a calm vertical stack —
 *
 *  1. any interrupted-OAuth connections as quiet recovery rows (finish / remove),
 *  2. an "Installed" strip of the apps already connected (icon tiles that open
 *     the detail sheet), shown only when there is at least one,
 *  3. the Custom integrations section, and
 *  4. the full connectable catalog grouped into flat category sections.
 *
 * Connected apps never repeat in the catalog — {@link CategoryCatalog} excludes
 * every connected toolkit, so the Installed strip is the single home for them.
 * The page-level search threads only into the category catalog; the Installed
 * strip stays unfiltered (it is identity, not discovery). Per-agent access lives
 * in Settings > Connected accounts, so the detail sheet here is view + reconnect
 * + disconnect only. ONE connect flow lives here (connect-only, no auto-grant)
 * and is handed to the catalog, the recovery rows, and the detail sheet so
 * closing any of them never kills an in-flight OAuth poll.
 */
export function IntegrationsReady({
  reconnectNotice,
  dismissReconnect,
}: IntegrationsReadyProps) {
  const { t } = useTranslation("integrations");
  const [query, setQuery] = useState("");
  const apps = useConnectedApps();
  const connectFlow = useConnectFlow({ autoGrant: false });
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const {
    selectedConn,
    selectedApp,
    disconnectApp,
    openConn,
    closeConn,
    requestDisconnect,
    closeDisconnect,
  } = useConnectionSelection(apps);

  return (
    <>
      <PageHeader
        title={t("home.title")}
        subtitle={t("home.description")}
        trailing={
          <CatalogSearchField
            value={query}
            onChange={setQuery}
            label={t("home.searchPlaceholder")}
            className="w-64 sm:w-72"
          />
        }
        className="mb-7"
      />

      {reconnectNotice && (
        <div className="mb-4">
          <ReconnectBanner onDismiss={dismissReconnect} />
        </div>
      )}

      {apps.recoveringRows.length > 0 && (
        <div className="mb-8 space-y-2">
          {apps.recoveringRows.map((row) => (
            <RecoveryRow
              key={row.connection.connectionId}
              row={row}
              connectFlow={connectFlow}
              onRemove={() => disconnect.mutate(row.connection.toolkit)}
            />
          ))}
        </div>
      )}

      <div className="space-y-8">
        {apps.isLoading ? (
          <IntegrationsSkeleton />
        ) : (
          apps.activeRows.length > 0 && (
            <section>
              <SectionHeader
                title={t("home.installedTitle")}
                className="mb-4"
              />
              <InstalledStrip active={apps.activeRows} onOpen={openConn} />
            </section>
          )
        )}

        <CustomIntegrationsSection />

        {!apps.isLoading && (
          <CategoryCatalog
            catalog={apps.catalogData}
            connections={apps.connData}
            connectFlow={connectFlow}
            query={query}
          />
        )}
      </div>

      {selectedConn && selectedApp && (
        <AppDetailSheet
          open
          onOpenChange={(open) => {
            if (!open) closeConn();
          }}
          display={selectedApp}
          connection={selectedConn}
          onReconnect={() => {
            void connectFlow.connect(selectedConn.toolkit);
            closeConn();
          }}
          onDisconnect={() => requestDisconnect(selectedConn.toolkit)}
        />
      )}

      <DisconnectAppDialog
        app={disconnectApp}
        grantMap={apps.grantMap}
        chipById={apps.chipById}
        onClose={closeDisconnect}
        onConfirm={(toolkit) => {
          disconnect.mutate(toolkit);
          closeDisconnect();
        }}
      />
    </>
  );
}

/**
 * A light placeholder standing in for the Installed strip and the category
 * catalog while the connections + toolkit catalog settle: a row of tile
 * placeholders over a few text bars. Decorative only, so it is `aria-hidden`.
 */
function IntegrationsSkeleton() {
  return (
    <div aria-hidden className="space-y-8">
      <div className="flex gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="size-12 animate-pulse rounded-xl bg-chip" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-chip" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-chip" />
        <div className="h-4 w-full max-w-sm animate-pulse rounded bg-chip" />
      </div>
    </div>
  );
}
