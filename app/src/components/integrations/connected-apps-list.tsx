import type { IntegrationConnection } from "@houston-ai/engine-client";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AgentChips } from "./agent-chips";
import { AppRow } from "./app-row";
import { connKey } from "./connected-apps-model";
import { PendingConnectionCallout } from "./pending-connection-callout";
import type { ConnectFlow } from "./use-connect-flow";
import type { ActiveAppRow, RecoveringAppRow } from "./use-connected-apps";

interface ConnectedAppsListProps {
  active: ActiveAppRow[];
  recovering: RecoveringAppRow[];
  grantsSupported: boolean;
  connectFlow: ConnectFlow;
  /** 1 = the narrow Settings drill-in (single column); 2 = the wide global
   * Integrations page (a two-column grid on >= sm). */
  columns: 1 | 2;
  onOpen: (connection: IntegrationConnection) => void;
  onRemove: (toolkit: string) => void;
}

/**
 * The connected-apps list shared by the global Integrations page and Settings >
 * Connected accounts: pending / errored connections first as full-width recovery
 * callouts (they need attention and would not fit a card), then the active apps
 * as clickable rows. `columns` picks the density — the wide Integrations page
 * lays the active apps out as a two-column grid, while the narrow Settings
 * drill-in keeps a single column. Each active row opens the detail sheet and
 * shows the agents using it BELOW the name via chips (or an "all/none agents"
 * label when the host has no per-agent grants), with a visible chevron so it
 * reads as openable without hovering. Purely presentational; the parent owns the
 * connect flow, the derived rows, and selection.
 */
export function ConnectedAppsList({
  active,
  recovering,
  grantsSupported,
  connectFlow,
  columns,
  onOpen,
  onRemove,
}: ConnectedAppsListProps) {
  const { t } = useTranslation("integrations");
  return (
    <div className="space-y-2">
      {recovering.length > 0 && (
        <div className="space-y-2">
          {recovering.map(({ connection, app }) => (
            <AppRow
              key={connKey(connection)}
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
      )}

      {active.length > 0 && (
        <div
          className={
            columns === 2
              ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
              : "space-y-2"
          }
        >
          {active.map(({ connection, app, chips }) => (
            <AppRow
              key={connKey(connection)}
              display={app}
              status="active"
              onClick={() => onOpen(connection)}
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
