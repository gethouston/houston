import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { appDisplay } from "./app-display";
import { CatalogBrowser } from "./catalog-browser";
import { ConnectWaitingPanel } from "./connect-waiting-panel";
import type { ConnectFlow } from "./use-connect-flow";

interface ConnectMoreAppsSectionProps {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  /** The catalog is still fetching (show a loader, not a "no apps" message). */
  loading?: boolean;
}

/**
 * The always-visible "Connect more apps" block shared by both surfaces (the
 * global integrations page and the agent tab). It makes the full ~1000-app
 * catalog permanently discoverable instead of hiding it behind a dialog: an
 * in-progress OAuth shows inline via the waiting panel, and the catalog lists
 * only the REMAINING (not-yet-connected) apps A-Z with the category dropdown,
 * search, and load-more the browser already provides. The connect flow lives on
 * the SURFACE (`connectFlow`), so polling survives across renders.
 */
export function ConnectMoreAppsSection({
  catalog,
  connections,
  connectFlow,
  loading,
}: ConnectMoreAppsSectionProps) {
  const { t } = useTranslation("integrations");
  const bySlug = useMemo(
    () => new Map(catalog.map((tk) => [tk.slug, tk])),
    [catalog],
  );
  // Exclude every already-connected app so this block lists only what the user
  // can still add; connected apps are surfaced by the caller's own grids.
  const connectedToolkits = useMemo(
    () => new Set(connections.map((c) => c.toolkit)),
    [connections],
  );
  // How many apps are still connectable — shown next to the title so the ~1000+
  // catalog reads as a headline number, not a hidden dialog.
  const availableCount = useMemo(
    () =>
      catalog.reduce(
        (n, tk) => (connectedToolkits.has(tk.slug) ? n : n + 1),
        0,
      ),
    [catalog, connectedToolkits],
  );

  const connecting = connectFlow.state;
  const connectingName = connecting
    ? appDisplay(connecting.toolkit, bySlug.get(connecting.toolkit)).name
    : "";

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        {t("connectMore.title")}
        {availableCount > 0 && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
            {availableCount.toLocaleString()}
          </span>
        )}
      </h3>

      {connecting && (
        <div className="mb-3">
          <ConnectWaitingPanel
            appName={connectingName}
            connectFlow={connectFlow}
          />
        </div>
      )}

      <CatalogBrowser
        catalog={catalog}
        connectedToolkits={connectedToolkits}
        connectingToolkit={connecting?.toolkit ?? null}
        excludeToolkits={connectedToolkits}
        loading={loading}
        onConnect={(toolkit) => void connectFlow.connect(toolkit)}
      />
    </section>
  );
}
