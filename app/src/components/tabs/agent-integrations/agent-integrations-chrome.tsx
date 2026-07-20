import { useTranslation } from "react-i18next";
import {
  AppDetailDialog,
  type ConnectFlow,
  IntegrationDisconnectDialog,
} from "../../integrations";
import type { AgentAppRow } from "./model";

/**
 * The per-agent Integrations tab's non-catalog chrome: the "Manage all
 * integrations" link to the global page, the detail modal for a strip row (view
 * + reconnect + disconnect — this tab is a pure connect surface, never a
 * permission editor), and the disconnect confirmation. Split out of
 * {@link AgentIntegrationsBody} so that body stays a lean layout of the shared
 * {@link CatalogShell}. State stays in the parent (`key={agent.id}` remount) so
 * none of it crosses agents; this component only renders it.
 */
export function AgentIntegrationsChrome({
  onManageAll,
  detailRow,
  disconnectRow,
  setDetailRow,
  setDisconnectRow,
  connectFlow,
  onDisconnect,
}: {
  onManageAll: () => void;
  detailRow: AgentAppRow | null;
  disconnectRow: AgentAppRow | null;
  setDetailRow: (row: AgentAppRow | null) => void;
  setDisconnectRow: (row: AgentAppRow | null) => void;
  connectFlow: ConnectFlow;
  onDisconnect: (toolkit: string) => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <>
      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={onManageAll}
          className="text-xs text-ink-muted underline underline-offset-4 decoration-dotted transition-colors hover:text-ink"
        >
          {t("agentTab.manageAll")}
        </button>
      </div>

      {detailRow && (
        <AppDetailDialog
          open
          onOpenChange={(open) => {
            if (!open) setDetailRow(null);
          }}
          display={detailRow.app}
          connection={detailRow.connection}
          onReconnect={() => {
            void connectFlow.connect(detailRow.connection.toolkit);
            setDetailRow(null);
          }}
          onDisconnect={() => {
            setDisconnectRow(detailRow);
            setDetailRow(null);
          }}
        />
      )}

      <IntegrationDisconnectDialog
        app={disconnectRow?.app ?? null}
        onClose={() => setDisconnectRow(null)}
        onConfirm={(toolkit) => {
          onDisconnect(toolkit);
          setDisconnectRow(null);
        }}
      />
    </>
  );
}
