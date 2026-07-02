import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAgentGrantMutation,
  useDisconnectIntegration,
} from "../../hooks/queries";
import { type AppDisplay, connectionRows } from "./integrations-app-display";
import { AvailableAppRow, ConnectedAppRow } from "./integrations-connected-row";
import { IntegrationDisconnectDialog } from "./integrations-disconnect-dialog";
import { INTEGRATION_PROVIDER, splitByGrant } from "./integrations-tab-model";

interface GrantedAppsSectionProps {
  agentId: string;
  connections: IntegrationConnection[];
  catalog: IntegrationToolkit[];
  /** This agent's grant set (the toolkit slugs it may use). */
  grants: ReadonlySet<string>;
  /** Reconnect = the same OAuth hand-off as connect (parent runs the poll). */
  onReconnect: (toolkit: string) => void;
}

/**
 * The multiplayer grant view (C4): "This agent can use" (granted connections,
 * toggle OFF = revoke) and "Your other connected apps" (connected but ungranted,
 * "Allow for this agent" = grant). Each toggle is a single add/remove change;
 * the mutation computes the replace-set PUT from the freshest cached grants (an
 * optimistic update, so quick successive toggles compose instead of resurrecting
 * each other). Disconnect stays here but its copy makes clear it removes the app
 * for ALL agents ("Disconnect everywhere").
 */
export function GrantedAppsSection({
  agentId,
  connections,
  catalog,
  grants,
  onReconnect,
}: GrantedAppsSectionProps) {
  const { t } = useTranslation("integrations");
  const grantMutation = useAgentGrantMutation(agentId);
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const [pendingDisconnect, setPendingDisconnect] = useState<AppDisplay | null>(
    null,
  );

  const { grantedRows, availableRows } = useMemo(() => {
    const { granted, available } = splitByGrant({ connections, grants });
    return {
      grantedRows: connectionRows(granted, catalog),
      availableRows: connectionRows(available, catalog),
    };
  }, [connections, grants, catalog]);

  // The optimistic update flips the row instantly; the spinner covers the
  // in-flight PUT for the toolkit the LATEST mutation is touching.
  const grantPendingFor = (toolkit: string) =>
    grantMutation.isPending && grantMutation.variables?.toolkit === toolkit;

  return (
    <>
      <section className="mt-6">
        <div className="mb-3">
          <h2 className="text-sm font-medium text-foreground">
            {t("grants.granted.title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("grants.granted.subtitle")}
          </p>
        </div>
        {grantedRows.length === 0 ? (
          <p className="rounded-xl bg-secondary px-3 py-4 text-center text-xs text-muted-foreground">
            {t("grants.granted.empty")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {grantedRows.map(({ connection, app }) => (
              <ConnectedAppRow
                key={connection.connectionId || connection.toolkit}
                app={app}
                status={connection.status}
                busy={
                  disconnect.isPending &&
                  disconnect.variables === connection.toolkit
                }
                grant={{
                  pending: grantPendingFor(connection.toolkit),
                  onToggle: () =>
                    grantMutation.mutate({
                      toolkit: connection.toolkit,
                      op: "remove",
                    }),
                }}
                onReconnect={() => onReconnect(connection.toolkit)}
                onDisconnect={() => setPendingDisconnect(app)}
                disconnectLabel={t("grants.disconnect.menu")}
              />
            ))}
          </div>
        )}
      </section>

      {availableRows.length > 0 && (
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-sm font-medium text-foreground">
              {t("grants.available.title")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("grants.available.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableRows.map(({ connection, app }) => (
              <AvailableAppRow
                key={connection.connectionId || connection.toolkit}
                app={app}
                status={connection.status}
                pending={grantPendingFor(connection.toolkit)}
                onAllow={() =>
                  grantMutation.mutate({
                    toolkit: connection.toolkit,
                    op: "add",
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      <IntegrationDisconnectDialog
        app={pendingDisconnect}
        scope="everywhere"
        onClose={() => setPendingDisconnect(null)}
        onConfirm={(toolkit) => disconnect.mutate(toolkit)}
      />
    </>
  );
}
