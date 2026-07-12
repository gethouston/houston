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
  onOpen: (connection: IntegrationConnection) => void;
  onRemove: (toolkit: string) => void;
}

/**
 * The connected-apps list for Settings > Connected accounts: pending / errored
 * connections first as full-width recovery callouts (they need attention and
 * would not fit a card), then the active apps as a single-column stack of
 * clickable rows. Each active row opens the detail sheet and shows the agents
 * using it BELOW the name via chips (or an "all/none agents" label when the host
 * has no per-agent grants), with a visible chevron so it reads as openable
 * without hovering. Purely presentational; the parent owns the connect flow, the
 * derived rows, and selection.
 */
export function ConnectedAppsList({
  active,
  recovering,
  grantsSupported,
  connectFlow,
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
        <div className="space-y-2">
          {active.map(({ connection, app, chips }) => (
            <AppRow
              key={connKey(connection)}
              display={app}
              status="active"
              onClick={() => onOpen(connection)}
              trailing={
                <ChevronRight aria-hidden className="size-4 text-ink-muted" />
              }
            >
              <div className="mt-1.5">
                {grantsSupported ? (
                  <AgentChips
                    agents={chips}
                    emptyLabel={t("home.usedByNone")}
                  />
                ) : (
                  <span className="text-xs text-ink-muted">
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
