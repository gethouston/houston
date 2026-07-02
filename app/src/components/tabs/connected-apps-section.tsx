import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../hooks/queries";
import { type AppDisplay, connectionRows } from "./integrations-app-display";
import { ConnectedAppRow } from "./integrations-connected-row";
import { IntegrationDisconnectDialog } from "./integrations-disconnect-dialog";
import { INTEGRATION_PROVIDER } from "./integrations-tab-model";

interface ConnectedAppsSectionProps {
  connections: IntegrationConnection[];
  catalog: IntegrationToolkit[];
  /** Reconnect = the same OAuth hand-off as connect (parent runs the poll). */
  onReconnect: (toolkit: string) => void;
}

/** The user's connected apps, with live status + a confirm-gated disconnect. */
export function ConnectedAppsSection({
  connections,
  catalog,
  onReconnect,
}: ConnectedAppsSectionProps) {
  const { t } = useTranslation("integrations");
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const [pendingDisconnect, setPendingDisconnect] = useState<AppDisplay | null>(
    null,
  );

  const rows = useMemo(
    () => connectionRows(connections, catalog),
    [connections, catalog],
  );

  if (rows.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          {t("connected.title")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("connected.count", { count: rows.length })}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(({ connection, app }) => (
          <ConnectedAppRow
            key={connection.connectionId || connection.toolkit}
            app={app}
            status={connection.status}
            busy={
              disconnect.isPending &&
              disconnect.variables === connection.toolkit
            }
            onReconnect={() => onReconnect(connection.toolkit)}
            onDisconnect={() => setPendingDisconnect(app)}
          />
        ))}
      </div>

      <IntegrationDisconnectDialog
        app={pendingDisconnect}
        scope="agent"
        onClose={() => setPendingDisconnect(null)}
        onConfirm={(toolkit) => disconnect.mutate(toolkit)}
      />
    </section>
  );
}
