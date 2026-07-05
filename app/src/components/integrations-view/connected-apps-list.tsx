import type { IntegrationConnection } from "@houston-ai/engine-client";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type AgentChip,
  AgentChips,
  type AppDisplay,
  AppRow,
  type ConnectFlow,
  PendingConnectionCallout,
} from "../integrations";

export interface ActiveAppRow {
  connection: IntegrationConnection;
  app: AppDisplay;
  chips: AgentChip[];
}

export interface RecoveringAppRow {
  connection: IntegrationConnection;
  app: AppDisplay;
}

interface ConnectedAppsListProps {
  active: ActiveAppRow[];
  recovering: RecoveringAppRow[];
  grantsSupported: boolean;
  connectFlow: ConnectFlow;
  onManage: (connection: IntegrationConnection, app: AppDisplay) => void;
  onRemove: (toolkit: string) => void;
}

/**
 * The connected-apps list: one static-but-clickable row per active app (logo,
 * name, live status dot, the agents using it, and a visible Manage affordance),
 * plus pending / errored connections rendered with the recovery callout. Purely
 * presentational; the parent owns the connect flow and the derived rows.
 */
export function ConnectedAppsList({
  active,
  recovering,
  grantsSupported,
  connectFlow,
  onManage,
  onRemove,
}: ConnectedAppsListProps) {
  const { t } = useTranslation("integrations");
  return (
    <div className="space-y-2">
      {active.map(({ connection, app, chips }) => (
        <AppRow
          key={connection.connectionId || connection.toolkit}
          display={app}
          status="active"
          onClick={() => onManage(connection, app)}
          trailing={
            <div className="flex items-center gap-2.5">
              {grantsSupported ? (
                <AgentChips agents={chips} emptyLabel={t("home.usedByNone")} />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t("home.usedByAll")}
                </span>
              )}
              <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                {t("home.manage")}
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 text-muted-foreground"
              />
            </div>
          }
        />
      ))}

      {recovering.map(({ connection, app }) => (
        <AppRow
          key={connection.connectionId || connection.toolkit}
          display={app}
          status={connection.status}
        >
          <PendingConnectionCallout
            status={connection.status === "error" ? "error" : "pending"}
            toolkit={connection.toolkit}
            connectFlow={connectFlow}
            appName={app.name}
            onRemove={() => onRemove(connection.toolkit)}
          />
        </AppRow>
      ))}
    </div>
  );
}

/** First-load placeholder rows while the connections + catalog fetch settles. */
export function ConnectedAppsListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5"
        >
          <div className="size-9 shrink-0 animate-pulse rounded-lg bg-muted/40" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded bg-muted/40" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  );
}
