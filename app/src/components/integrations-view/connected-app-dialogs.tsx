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
