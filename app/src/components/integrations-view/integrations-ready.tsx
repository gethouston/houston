import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ConnectMoreAppsSection,
  ReconnectBanner,
  useConnectFlow,
} from "../integrations";
import { AppDetailOverlay } from "./app-detail-overlay";
import {
  ConnectedAppsList,
  ConnectedAppsListSkeleton,
} from "./connected-apps-list";
import { useConnectedApps } from "./use-connected-apps";

interface IntegrationsReadyProps {
  reconnectNotice: boolean;
  dismissReconnect: () => Promise<void>;
}

/**
 * The ready state of the global Integrations page. Two always-present sections:
 * the apps the user has connected (a two-column grid of cards, ONE per app, each
 * opening the detail sheet for per-ACCOUNT access, rename, disconnect, and
 * adding another account, with pending / errored connections shown full-width
 * per account for recovery), then the full "Connect more apps" catalog. ONE
 * connect flow lives here (connect-only, no auto-grant) and is handed to the
 * catalog, the recovery callouts, and the detail overlay so closing any of them
 * never kills an in-flight OAuth poll.
 */
export function IntegrationsReady({
  reconnectNotice,
  dismissReconnect,
}: IntegrationsReadyProps) {
  const { t } = useTranslation("integrations");
  const apps = useConnectedApps();
  const connectFlow = useConnectFlow({ autoGrant: false });

  // The detail overlay is keyed by TOOLKIT so it shows every account of the app;
  // the grid below sets it. The overlay owns its own edit / disconnect dialogs.
  const [selectedToolkit, setSelectedToolkit] = useState<string | null>(null);

  const hasConnections = apps.connData.length > 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[28px] font-normal text-foreground">
          {t("home.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("home.description")}
        </p>
      </div>

      {reconnectNotice && (
        <div className="mb-4">
          <ReconnectBanner onDismiss={dismissReconnect} />
        </div>
      )}

      <div className="space-y-8">
        {(apps.isLoading || hasConnections) && (
          <section>
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("home.connectedTitle")}
            </h3>
            {apps.isLoading ? (
              <ConnectedAppsListSkeleton />
            ) : (
              <ConnectedAppsList
                active={apps.activeCards}
                recovering={apps.recoveringRows}
                grantsSupported={apps.grantsSupported}
                connectFlow={connectFlow}
                onManage={setSelectedToolkit}
                onRemove={apps.disconnect}
                customToolkits={apps.customSlugs}
                mcpToolkits={apps.mcpSlugs}
              />
            )}
          </section>
        )}

        <ConnectMoreAppsSection
          catalog={apps.catalogData}
          connections={apps.connData}
          connectFlow={connectFlow}
          loading={apps.catalogLoading}
          customEnabled={apps.customEnabled}
          mcpEnabled={apps.mcpEnabled}
        />
      </div>

      <AppDetailOverlay
        apps={apps}
        connectFlow={connectFlow}
        selectedToolkit={selectedToolkit}
        onClose={() => setSelectedToolkit(null)}
      />
    </>
  );
}
