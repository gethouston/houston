import type { IntegrationConnection } from "@houston-ai/engine-client";
import { useState } from "react";
import { appDisplay } from "./app-display";
import { connKey } from "./connected-apps-model";
import type { ConnectedApps } from "./use-connected-apps";

/**
 * The selection + disconnect scaffolding shared by the two connected-apps
 * surfaces (the global Integrations page and Settings > Connected accounts):
 * which connection's detail sheet is open, and which toolkit is pending a
 * confirm-gated disconnect. The open sheet is re-resolved against the LIVE
 * connection by the exact id the user opened — a toolkit can hold more than one
 * account (an active login beside a leftover pending one), so keying by toolkit
 * would resolve the wrong row; a disconnect elsewhere then drops it and closes.
 * Requesting a disconnect also closes the sheet so the two never stack.
 */
export function useConnectionSelection(apps: ConnectedApps) {
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [disconnectToolkit, setDisconnectToolkit] = useState<string | null>(
    null,
  );

  const selectedConn = selectedConnId
    ? apps.connData.find((c) => connKey(c) === selectedConnId)
    : undefined;
  const selectedApp = selectedConn
    ? appDisplay(selectedConn.toolkit, apps.bySlug.get(selectedConn.toolkit))
    : null;
  const disconnectApp = disconnectToolkit
    ? appDisplay(disconnectToolkit, apps.bySlug.get(disconnectToolkit))
    : null;

  return {
    selectedConn,
    selectedApp,
    disconnectApp,
    openConn: (connection: IntegrationConnection) =>
      setSelectedConnId(connKey(connection)),
    closeConn: () => setSelectedConnId(null),
    requestDisconnect: (toolkit: string) => {
      setDisconnectToolkit(toolkit);
      setSelectedConnId(null);
    },
    closeDisconnect: () => setDisconnectToolkit(null),
  };
}
