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
  const [disconnectTarget, setDisconnectTarget] = useState<{
    toolkit: string;
    /** Set = remove only THIS account of the toolkit (one of several). */
    account?: IntegrationConnection;
  } | null>(null);

  const selectedConn = selectedConnId
    ? apps.connData.find((c) => connKey(c) === selectedConnId)
    : undefined;
  const selectedApp = selectedConn
    ? appDisplay(selectedConn.toolkit, apps.bySlug.get(selectedConn.toolkit))
    : null;
  // Every ACTIVE account behind the open app — the detail dialog's list.
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
    /** With `account`, the confirm targets ONE account of the toolkit; without
     *  it, the whole app (every account). Either way the sheet closes so the
     *  two dialogs never stack. */
    requestDisconnect: (toolkit: string, account?: IntegrationConnection) => {
      setDisconnectTarget({ toolkit, ...(account ? { account } : {}) });
      setSelectedConnId(null);
    },
    closeDisconnect: () => setDisconnectTarget(null),
  };
}
