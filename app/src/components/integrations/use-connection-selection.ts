import type { IntegrationConnection } from "@houston/engine-adapter";
import { useState } from "react";
import { appDisplay } from "./app-display";
import { connKey } from "./connected-apps-model";
import type { ConnectedApps } from "./use-connected-apps";

export function useConnectionSelection(apps: ConnectedApps) {
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<{
    toolkit: string;
    account?: IntegrationConnection;
  } | null>(null);

  const selectedConn = selectedConnId
    ? apps.connData.find((c) => connKey(c) === selectedConnId)
    : undefined;
  const selectedApp = selectedConn
    ? appDisplay(selectedConn.toolkit, apps.bySlug.get(selectedConn.toolkit))
    : null;
  const selectedAccounts = selectedConn
    ? apps.connData.filter(
        (c) => c.toolkit === selectedConn.toolkit && c.status === "active",
      )
    : [];
  const disconnectApp = disconnectTarget
    ? appDisplay(
        disconnectTarget.toolkit,
        apps.bySlug.get(disconnectTarget.toolkit),
      )
    : null;

  return {
    selectedConn,
    selectedApp,
    selectedAccounts,
    disconnectApp,
    disconnectAccount: disconnectTarget?.account,
    openConn: (connection: IntegrationConnection) =>
      setSelectedConnId(connKey(connection)),
    closeConn: () => setSelectedConnId(null),
    requestDisconnect: (toolkit: string, account?: IntegrationConnection) => {
      setDisconnectTarget({ toolkit, ...(account ? { account } : {}) });
      setSelectedConnId(null);
    },
    closeDisconnect: () => setDisconnectTarget(null),
  };
}
