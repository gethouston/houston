import { useCallback, useMemo, useState } from "react";
import {
  useConnections,
  useConnectedToolkits,
  useResetConnections,
} from "../../hooks/queries";
import { tauriConnections, tauriSystem } from "../../lib/tauri";
import { useComposioAuth } from "../../hooks/use-composio-auth";
import { ComposioAuthDialog } from "../composio-auth-dialog";
import { BrowseAppsSection } from "./browse-apps-section";
import { ConnectedAppsSection } from "./connected-apps-section";
import {
  LoadingState,
  NotInstalledState,
  NeedsAuthState,
  ErrorState,
} from "./integrations-states";

const COMPOSIO_DASHBOARD_URL = "https://dashboard.composio.dev";

interface IntegrationsViewProps {
  title?: string;
}

export function IntegrationsView({ title }: IntegrationsViewProps) {
  const { data: result, isLoading: loading, refetch } = useConnections();
  const reset = useResetConnections();
  const auth = useComposioAuth(() => reset());
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const isSignedIn = result?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connectedSet = useMemo(
    () => new Set(connectedList ?? []),
    [connectedList],
  );

  const handleManage = useCallback(() => {
    tauriSystem.openUrl(COMPOSIO_DASHBOARD_URL);
  }, []);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      await tauriConnections.installCli();
      await reset();
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  }, [reset]);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        {title && (
          <h1 className="text-[28px] font-normal text-foreground mb-6">
            {title}
          </h1>
        )}

        {loading && <LoadingState />}

        {!loading && result?.status === "not_installed" && (
          <NotInstalledState
            onInstall={handleInstall}
            installing={installing}
          />
        )}

        {!loading && result?.status === "needs_auth" && (
          <NeedsAuthState onAuth={auth.startAuth} />
        )}

        {!loading && result?.status === "error" && (
          <ErrorState
            message={result.message}
            onRetry={() => refetch()}
            onReconnect={handleManage}
          />
        )}

        {installError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-4">
            {installError}
          </p>
        )}

        {!loading && result?.status === "ok" && (
          <>
            <ConnectedAppsSection connectedToolkits={connectedSet} />
            <BrowseAppsSection connectedToolkits={connectedSet} />
          </>
        )}
      </div>

      <ComposioAuthDialog
        state={auth.state}
        onClose={auth.close}
        onReopenBrowser={auth.reopenBrowser}
      />
    </div>
  );
}
