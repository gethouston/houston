import type { IntegrationConnection } from "@houston-ai/engine-client";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type AgentChip,
  AgentChips,
  type AppDisplay,
  AppRow,
  accountDisplayLabel,
  type ConnectFlow,
  PendingConnectionCallout,
} from "../integrations";

/** One card per connected app; its accounts collapse into a single row. */
export interface ActiveAppCard {
  toolkit: string;
  app: AppDisplay;
  /** Every ACTIVE connected account of this app (at least one). */
  connections: IntegrationConnection[];
  /** Union of the agents that can use ANY of this app's accounts. */
  chips: AgentChip[];
}

export interface RecoveringAppRow {
  connection: IntegrationConnection;
  app: AppDisplay;
}

interface ConnectedAppsListProps {
  active: ActiveAppCard[];
  recovering: RecoveringAppRow[];
  grantsSupported: boolean;
  connectFlow: ConnectFlow;
  onManage: (toolkit: string) => void;
  onRemove: (connectionId: string) => void;
}

/**
 * The connected-apps section body: pending / errored connections first, PER
 * ACCOUNT, as full-width recovery callouts (they need attention and would not
 * fit a card), then the active apps as a TWO-COLUMN grid of clickable cards, ONE
 * per app. Each card shows the logo, name, live status dot, a subtitle naming
 * the single account or the account count, the agents using it BELOW that, and a
 * visible chevron so it reads as openable without hovering. Purely
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
      {recovering.length > 0 && (
        <div className="space-y-2">
          {recovering.map(({ connection, app }) => (
            <AppRow
              key={connection.connectionId}
              display={app}
              status={connection.status}
            >
              <PendingConnectionCallout
                connection={connection}
                connectFlow={connectFlow}
                appName={app.name}
                onRemove={onRemove}
              />
            </AppRow>
          ))}
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {active.map(({ toolkit, app, connections, chips }) => (
            <AppRow
              key={toolkit}
              display={app}
              status="active"
              description={
                connections.length > 1
                  ? t("account.count", { count: connections.length })
                  : accountDisplayLabel(connections[0], t("account.unnamed"))
              }
              onClick={() => onManage(toolkit)}
              trailing={
                <ChevronRight
                  aria-hidden
                  className="size-4 text-muted-foreground"
                />
              }
            >
              <div className="mt-1.5">
                {grantsSupported ? (
                  <AgentChips
                    agents={chips}
                    emptyLabel={t("home.usedByNone")}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("home.usedByAll")}
                  </span>
                )}
              </div>
            </AppRow>
          ))}
        </div>
      )}
    </div>
  );
}

/** First-load placeholder rows while the connections + catalog fetch settles. */
export function ConnectedAppsListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
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
