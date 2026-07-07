import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { appDisplay } from "./app-display";
import { CatalogBrowser } from "./catalog-browser";
import { ConnectWaitingPanel } from "./connect-waiting-panel";
import {
  type CustomDialogTarget,
  CustomIntegrationDialog,
} from "./custom-integration-dialog";
import { type McpDialogTarget, McpServerDialog } from "./mcp-server-dialog";
import type { ConnectFlow } from "./use-connect-flow";

interface ConnectMoreAppsSectionProps {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  /** The catalog is still fetching (show a loader, not a "no apps" message). */
  loading?: boolean;
  /**
   * When the custom-integration provider is wired, the footer shows the "add a
   * custom integration" CTA. Off (default) hides it, so hosts without the
   * provider render exactly as before.
   */
  customEnabled?: boolean;
  /**
   * When the MCP server provider is wired, the footer shows the "add an MCP
   * server" CTA beside the custom one. Off (default) hides it.
   */
  mcpEnabled?: boolean;
  /** Agent context: a newly added custom integration auto-grants to this agent. */
  agentId?: string;
  autoGrant?: boolean;
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
  customEnabled,
  mcpEnabled,
  agentId,
  autoGrant,
}: ConnectMoreAppsSectionProps) {
  const { t } = useTranslation("integrations");
  const [customTarget, setCustomTarget] = useState<CustomDialogTarget | null>(
    null,
  );
  const [mcpTarget, setMcpTarget] = useState<McpDialogTarget | null>(null);
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

      {(customEnabled || mcpEnabled) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">{t("custom.cantFind")}</span>
          {customEnabled && (
            <button
              type="button"
              onClick={() => setCustomTarget({ mode: "create" })}
              className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 decoration-dotted transition-colors hover:text-primary"
            >
              <Plus className="size-3.5" />
              {t("custom.addCta")}
            </button>
          )}
          {mcpEnabled && (
            <button
              type="button"
              onClick={() => setMcpTarget({ mode: "create" })}
              className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 decoration-dotted transition-colors hover:text-primary"
            >
              <Plus className="size-3.5" />
              {t("mcp.addCta")}
            </button>
          )}
        </div>
      )}

      <CustomIntegrationDialog
        target={customTarget}
        onClose={() => setCustomTarget(null)}
        agentId={agentId}
        autoGrant={autoGrant ?? false}
      />

      <McpServerDialog
        target={mcpTarget}
        onClose={() => setMcpTarget(null)}
        agentId={agentId}
        autoGrant={autoGrant ?? false}
      />
    </section>
  );
}
