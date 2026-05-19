import { useCallback, useMemo, useState } from "react";
import {
  useConnectedToolkits,
  useConnections,
  useInvalidateConnections,
} from "../../hooks/queries";
import { tauriConnections, tauriSystem } from "../../lib/tauri";
import { useComposioAuth } from "../../hooks/use-composio-auth";
import { ComposioAuthDialog } from "../composio-auth-dialog";
import { BrowseAppsSection } from "./browse-apps-section";
import { StackDiscoverPanel } from "./stack-discover-panel";
import {
  LoadingState,
  NotInstalledState,
  NeedsAuthState,
  ErrorState,
} from "./integrations-states";
import type { TabProps } from "../../lib/types";

const COMPOSIO_DASHBOARD_URL = "https://dashboard.composio.dev";

export default function ConnectionsTab(_props: TabProps) {
  const { data: result, isLoading: loading, refetch } = useConnections();
  const invalidate = useInvalidateConnections();
  const auth = useComposioAuth(() => invalidate());
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const { data: connectedToolkits } = useConnectedToolkits(
    result?.status === "ok",
  );
  const connectedToolkitsSet = useMemo<Set<string>>(
    () => new Set<string>(connectedToolkits ?? []),
    [connectedToolkits],
  );

  const handleManage = useCallback(() => {
    tauriSystem.openUrl(COMPOSIO_DASHBOARD_URL);
  }, []);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      await tauriConnections.installCli();
      await invalidate();
    } catch (e) {
      setInstallError(String(e));
    } finally {
      setInstalling(false);
    }
  }, [invalidate]);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        {loading && <LoadingState />}

        {!loading && result?.status === "not_installed" && (
          <NotInstalledState onInstall={handleInstall} installing={installing} />
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
            <StackDiscoverPanel connectedToolkits={connectedToolkitsSet} />
            <BrowseAppsSection connectedToolkits={connectedToolkitsSet} />
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
