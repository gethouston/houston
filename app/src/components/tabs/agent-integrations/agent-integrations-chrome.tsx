import type { IntegrationConnection } from "@houston-ai/engine-client";
import { useState } from "react";
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
 * + accounts + reconnect + disconnect — this tab is a pure connect surface,
 * never a permission editor), and the disconnect confirmation (the whole app,
 * or ONE account of it when the app holds several — HOU-901). Row state stays
 * in the parent (`key={agent.id}` remount) so none of it crosses agents; only
 * the transient "which account is pending disconnect" lives here, cleared with
 * the dialog it belongs to.
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
  onDisconnect: (toolkit: string, connectionId?: string) => void;
}) {
  const { t } = useTranslation("integrations");
  const [disconnectAccount, setDisconnectAccount] = useState<
    IntegrationConnection | undefined
  >(undefined);
  const startConnect = (toolkit: string) => {
    void connectFlow.connect(toolkit, `agentDetail:${toolkit}`);
    setDetailRow(null);
  };
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
          accounts={detailRow.accounts}
          onReconnect={() => startConnect(detailRow.connection.toolkit)}
          onAddAccount={() => startConnect(detailRow.connection.toolkit)}
          onDisconnect={() => {
            setDisconnectAccount(undefined);
            setDisconnectRow(detailRow);
            setDetailRow(null);
          }}
          onDisconnectAccount={(account) => {
            setDisconnectAccount(account);
            setDisconnectRow(detailRow);
            setDetailRow(null);
          }}
        />
      )}

      <IntegrationDisconnectDialog
        app={disconnectRow?.app ?? null}
        account={disconnectAccount}
        onClose={() => {
          setDisconnectRow(null);
          setDisconnectAccount(undefined);
        }}
        onConfirm={(toolkit, connectionId) => {
          onDisconnect(toolkit, connectionId);
          setDisconnectRow(null);
          setDisconnectAccount(undefined);
        }}
      />
    </>
  );
}
