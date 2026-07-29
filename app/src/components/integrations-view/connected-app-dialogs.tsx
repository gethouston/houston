import {
  AppDetailDialog,
  type ConnectFlow,
  IntegrationDisconnectDialog,
  type useConnectionSelection,
} from "../integrations";

interface ConnectedAppDialogsProps {
  selection: ReturnType<typeof useConnectionSelection>;
  connectFlow: ConnectFlow;
  onRemove: (toolkit: string, connectionId?: string) => void;
}

/**
 * The connected-app dialogs for the global Integrations page: the per-app detail
 * MODAL (info + accounts + reconnect + disconnect — a personal connection
 * surface, never a permission editor) and the confirm-gated disconnect dialog
 * (the whole app, or ONE account of it when the app holds several — HOU-901).
 * Extracted from the page so `integrations-ready.tsx` stays within the file-size
 * limit; the page owns the selection + connect flow and hands them in so a tile
 * click, a reconnect, an added account, and a disconnect all drive the same
 * state.
 */
export function ConnectedAppDialogs({
  selection,
  connectFlow,
  onRemove,
}: ConnectedAppDialogsProps) {
  const {
    selectedConn,
    selectedApp,
    selectedAccounts,
    disconnectApp,
    disconnectAccount,
    closeConn,
    requestDisconnect,
    closeDisconnect,
  } = selection;

  return (
    <>
      {selectedConn && selectedApp && (
        <AppDetailDialog
          open
          onOpenChange={(open) => {
            if (!open) closeConn();
          }}
          display={selectedApp}
          connection={selectedConn}
          accounts={selectedAccounts}
          onReconnect={() => {
            void connectFlow.connect(
              selectedConn.toolkit,
              `detail:${selectedConn.toolkit}`,
            );
            closeConn();
          }}
          onAddAccount={() => {
            // Adding a second account IS a fresh connect of the same app: the
            // provider mints a new connected account and keeps the first.
            void connectFlow.connect(
              selectedConn.toolkit,
              `detail:${selectedConn.toolkit}`,
            );
            closeConn();
          }}
          onDisconnect={() => requestDisconnect(selectedConn.toolkit)}
          onDisconnectAccount={(account) =>
            requestDisconnect(selectedConn.toolkit, account)
          }
        />
      )}

      <IntegrationDisconnectDialog
        app={disconnectApp}
        account={disconnectAccount}
        onClose={closeDisconnect}
        onConfirm={(toolkit, connectionId) => {
          onRemove(toolkit, connectionId);
          closeDisconnect();
        }}
      />
    </>
  );
}
