import { ConfirmDialog } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useDisconnectIntegration,
  useSetAgentGrants,
} from "../../hooks/queries";
import { type AppDisplay, appDisplay } from "./integrations-app-rows";
import { AvailableAppRow, ConnectedAppRow } from "./integrations-connected-row";
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

/** Resolve + sort a connection list into display rows by app name. */
function toRows(
  connections: IntegrationConnection[],
  catalog: IntegrationToolkit[],
) {
  const bySlug = new Map(catalog.map((tk) => [tk.slug, tk]));
  return connections
    .map((c) => ({
      connection: c,
      app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
    }))
    .sort((a, b) => a.app.name.localeCompare(b.app.name));
}

/**
 * The multiplayer grant view (C4): "This agent can use" (granted connections,
 * toggle OFF = revoke) and "Your other connected apps" (connected but ungranted,
 * "Allow for this agent" = grant). Every grant change is an instant replace-set
 * PUT over the current grant set. Disconnect stays here but its copy makes clear
 * it removes the app for ALL agents ("Disconnect everywhere").
 */
export function GrantedAppsSection({
  agentId,
  connections,
  catalog,
  grants,
  onReconnect,
}: GrantedAppsSectionProps) {
  const { t } = useTranslation("integrations");
  const setGrants = useSetAgentGrants(agentId);
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);
  const [pendingDisconnect, setPendingDisconnect] = useState<AppDisplay | null>(
    null,
  );

  const { grantedRows, availableRows } = useMemo(() => {
    const { granted, available } = splitByGrant({ connections, grants });
    return {
      grantedRows: toRows(granted, catalog),
      availableRows: toRows(available, catalog),
    };
  }, [connections, grants, catalog]);

  // A grant change replaces the whole set: revoke drops the slug, allow adds it.
  const revoke = (toolkit: string) =>
    setGrants.mutate([...grants].filter((g) => g !== toolkit));
  const allow = (toolkit: string) => setGrants.mutate([...grants, toolkit]);
  // `variables` is the NEXT set being PUT; a slug is mid-toggle when its
  // membership there differs from now (added = allowing, removed = revoking).
  const grantPendingFor = (toolkit: string) => {
    if (!setGrants.isPending || !setGrants.variables) return false;
    return grants.has(toolkit) !== setGrants.variables.includes(toolkit);
  };

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
                  onToggle: () => revoke(connection.toolkit),
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
                onAllow={() => allow(connection.toolkit)}
              />
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={pendingDisconnect !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDisconnect(null);
        }}
        title={t("grants.disconnect.confirmTitle", {
          name: pendingDisconnect?.name ?? "",
        })}
        description={t("grants.disconnect.confirmBody", {
          name: pendingDisconnect?.name ?? "",
        })}
        confirmLabel={t("grants.disconnect.confirmAction")}
        cancelLabel={t("connected.disconnect.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (pendingDisconnect) disconnect.mutate(pendingDisconnect.toolkit);
        }}
      />
    </>
  );
}
