import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { appDisplay } from "./app-display";
import { AppRow } from "./app-row";
import { CatalogBrowser } from "./catalog-browser";
import { ConnectWaitingPanel } from "./connect-waiting-panel";
import type { ConnectFlow } from "./use-connect-flow";

interface AppCatalogPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  /** The catalog is still fetching (show a loader, not a "no apps" message). */
  loading?: boolean;
  /** Agent context: the toolkits already active for this agent. */
  grantedToolkits?: ReadonlySet<string>;
  /** Agent context: activate a connected-but-inactive app for this agent. */
  onActivate?: (toolkit: string) => void;
  /** Agent context: names the "Ready to activate" subtitle. */
  agentName?: string;
}

/**
 * The single add-apps experience for both surfaces. In agent context
 * (`grantedToolkits` + `onActivate` given) it shows a "Ready to activate" group
 * of connected-but-inactive apps above the searchable catalog; the global page
 * is connect-only. The flow lives on the parent (`connectFlow`), so closing the
 * dialog never kills polling; while a connect is in progress, the waiting panel
 * shows and every other Connect is disabled.
 */
export function AppCatalogPicker({
  open,
  onOpenChange,
  catalog,
  connections,
  connectFlow,
  loading,
  grantedToolkits,
  onActivate,
  agentName,
}: AppCatalogPickerProps) {
  const { t } = useTranslation("integrations");
  const bySlug = useMemo(
    () => new Map(catalog.map((tk) => [tk.slug, tk])),
    [catalog],
  );
  const connectedToolkits = useMemo(
    () => new Set(connections.map((c) => c.toolkit)),
    [connections],
  );

  const agentContext = !!grantedToolkits && !!onActivate;
  const readyToActivate = useMemo(() => {
    if (!agentContext || !grantedToolkits) return [];
    return connections
      .filter((c) => c.status === "active" && !grantedToolkits.has(c.toolkit))
      .map((c) => ({
        connection: c,
        app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
      }))
      .sort((a, b) => a.app.name.localeCompare(b.app.name));
  }, [agentContext, grantedToolkits, connections, bySlug]);

  const connecting = connectFlow.state;
  const connectingName = connecting
    ? appDisplay(connecting.toolkit, bySlug.get(connecting.toolkit)).name
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{t("picker.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-auto px-5 py-4">
          {connecting && (
            <ConnectWaitingPanel
              appName={connectingName}
              connectFlow={connectFlow}
            />
          )}

          {readyToActivate.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-foreground">
                {t("picker.readyTitle")}
              </h3>
              <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
                {t("picker.readySubtitle", { agent: agentName ?? "" })}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {readyToActivate.map(({ connection, app }) => (
                  <AppRow
                    key={connection.connectionId || connection.toolkit}
                    display={app}
                    description={app.description}
                    trailing={
                      <button
                        type="button"
                        onClick={() => onActivate?.(connection.toolkit)}
                        className="inline-flex h-7 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        {t("picker.activate")}
                      </button>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("picker.connectTitle")}
            </h3>
            <CatalogBrowser
              catalog={catalog}
              connectedToolkits={connectedToolkits}
              connectingToolkit={connecting?.toolkit ?? null}
              excludeToolkits={agentContext ? connectedToolkits : undefined}
              loading={loading}
              onConnect={(toolkit) => void connectFlow.connect(toolkit)}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
