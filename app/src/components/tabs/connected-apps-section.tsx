import { ConfirmDialog } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDisconnectIntegration } from "../../hooks/queries";
import { type AppDisplay, appDisplay } from "./integrations-app-rows";
import { ConnectedAppRow } from "./integrations-connected-row";
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

  const rows = useMemo(() => {
    const bySlug = new Map(catalog.map((tk) => [tk.slug, tk]));
    return connections
      .map((c) => ({
        connection: c,
        app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
      }))
      .sort((a, b) => a.app.name.localeCompare(b.app.name));
  }, [connections, catalog]);

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

      <ConfirmDialog
        open={pendingDisconnect !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDisconnect(null);
        }}
        title={t("connected.disconnect.confirmTitle", {
          name: pendingDisconnect?.name ?? "",
        })}
        description={t("connected.disconnect.confirmBody", {
          name: pendingDisconnect?.name ?? "",
        })}
        confirmLabel={t("connected.disconnect.confirmAction")}
        cancelLabel={t("connected.disconnect.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (pendingDisconnect) disconnect.mutate(pendingDisconnect.toolkit);
        }}
      />
    </section>
  );
}
