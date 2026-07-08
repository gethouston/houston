import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRenameIntegrationConnection } from "../../hooks/queries/use-integrations";
import {
  AppDetailSheet,
  accountDisplayLabel,
  appDisplay,
  type ConnectFlow,
  type CustomDialogTarget,
  CustomIntegrationDialog,
  INTEGRATION_PROVIDER,
  IntegrationDisconnectDialog,
  type McpDialogTarget,
  McpServerDialog,
} from "../integrations";
import { agentChipsFor } from "./integrations-view-model";
import { useAgentGrantToggle } from "./use-agent-grant-toggle";
import type { ConnectedApps } from "./use-connected-apps";

interface AppDetailOverlayProps {
  apps: ConnectedApps;
  connectFlow: ConnectFlow;
  /** The toolkit whose detail sheet is open (`null` = nothing selected). */
  selectedToolkit: string | null;
  /** Close the detail sheet (the parent owns the selection for its app grid). */
  onClose: () => void;
}

/**
 * The selection-driven overlay for the global Integrations page: the per-app
 * detail sheet plus the dialogs it opens (edit a custom / MCP integration,
 * confirm a disconnect). The parent owns `selectedToolkit` (its app grid sets
 * it); this component owns the disconnect + edit dialog state and every
 * derivation off the live connection list, so a disconnect elsewhere drops the
 * row and closes the sheet on its own. Kept out of the page view so the page
 * stays a thin layout of its sections.
 */
export function AppDetailOverlay({
  apps,
  connectFlow,
  selectedToolkit,
  onClose,
}: AppDetailOverlayProps) {
  const { t } = useTranslation("integrations");
  const rename = useRenameIntegrationConnection(INTEGRATION_PROVIDER);
  const toggle = useAgentGrantToggle();

  // The disconnect dialog is keyed by the single ACCOUNT being removed; the edit
  // dialogs by the managed integration (custom or MCP) the sheet's Edit opens.
  const [disconnectConnId, setDisconnectConnId] = useState<string | null>(null);
  const [customEdit, setCustomEdit] = useState<CustomDialogTarget | null>(null);
  const [mcpEdit, setMcpEdit] = useState<McpDialogTarget | null>(null);

  const selectedIsMcp =
    selectedToolkit !== null && apps.mcpSlugs.has(selectedToolkit);
  const manageKind =
    selectedToolkit !== null && apps.customSlugs.has(selectedToolkit)
      ? ("custom" as const)
      : selectedIsMcp
        ? ("mcp" as const)
        : undefined;

  const selectedConnections = selectedToolkit
    ? apps.connData.filter((c) => c.toolkit === selectedToolkit)
    : [];
  const selectedApp =
    selectedToolkit && selectedConnections.length > 0
      ? appDisplay(selectedToolkit, apps.bySlug.get(selectedToolkit))
      : null;

  const disconnectConn = disconnectConnId
    ? apps.connData.find((c) => c.connectionId === disconnectConnId)
    : undefined;
  const disconnectApp = disconnectConn
    ? appDisplay(
        disconnectConn.toolkit,
        apps.bySlug.get(disconnectConn.toolkit),
      )
    : null;

  return (
    <>
      {selectedApp && (
        <AppDetailSheet
          open
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
          display={selectedApp}
          connections={selectedConnections}
          agents={apps.agentChips}
          activeAgentIdsByConnection={apps.activeAgentIdsByConnection}
          grantsSupported={apps.grantsSupported}
          canEdit={apps.canEdit}
          connectInFlight={connectFlow.state !== null}
          onToggleAgent={(connectionId, agentId, active) =>
            toggle.mutate({ agentId, connectionId, active })
          }
          onRename={(connectionId, alias) =>
            rename.mutate({ connectionId, alias })
          }
          onReconnect={(connectionId) => {
            const conn = selectedConnections.find(
              (c) => c.connectionId === connectionId,
            );
            if (conn) void connectFlow.connect(conn.toolkit);
            onClose();
          }}
          onDisconnect={setDisconnectConnId}
          onAddAccount={(toolkit) => void connectFlow.connect(toolkit)}
          manageKind={manageKind}
          onEdit={() => {
            const edit = {
              mode: "edit" as const,
              connectionId: selectedApp.toolkit,
              name: selectedApp.name,
              description: selectedApp.description,
            };
            if (selectedIsMcp) setMcpEdit(edit);
            else setCustomEdit(edit);
            onClose();
          }}
        />
      )}

      <CustomIntegrationDialog
        target={customEdit}
        onClose={() => setCustomEdit(null)}
        autoGrant={false}
      />

      <McpServerDialog
        target={mcpEdit}
        onClose={() => setMcpEdit(null)}
        autoGrant={false}
      />

      <IntegrationDisconnectDialog
        app={disconnectApp}
        connectionId={disconnectConnId}
        accountLabel={
          disconnectConn
            ? accountDisplayLabel(disconnectConn, t("account.unnamed"))
            : undefined
        }
        scope="everywhere"
        affectedAgents={
          disconnectConnId
            ? agentChipsFor(
                apps.accountAgents.get(disconnectConnId) ?? [],
                apps.chipById,
              )
            : undefined
        }
        onClose={() => setDisconnectConnId(null)}
        onConfirm={(connectionId) => {
          apps.disconnect(connectionId);
          setDisconnectConnId(null);
        }}
      />
    </>
  );
}
