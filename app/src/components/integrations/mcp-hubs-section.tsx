import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useDisconnectIntegration,
  useIntegrationConnections,
  useIntegrationStatus,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { RowCard } from "../cards/row-card";
import { RowCardButton } from "../cards/row-card-button";
import { INTEGRATION_PROVIDER } from "./model";
import { useConnectFlow } from "./use-connect-flow";

/**
 * The MCP app-hub provider ids wired into this engine (everything in the
 * integration status that is not the platform provider). An app hub is one
 * OAuth sign-in that brings a whole catalog of apps at once, e.g. Composio's
 * hosted MCP endpoint configured via HOUSTON_MCP_INTEGRATIONS.
 */
export function useMcpHubProviders(): string[] {
  const status = useIntegrationStatus();
  return (status.data ?? [])
    .filter((p) => p.provider !== INTEGRATION_PROVIDER)
    .map((p) => p.provider);
}

/**
 * The "App hubs" block of the Integrations page. Renders nothing when no hub
 * is configured, so every surface can include it unconditionally. Each hub is
 * one card: its display name comes from the provider's single pseudo-toolkit,
 * Connect runs the same browser OAuth flow as any app (useConnectFlow, which
 * polls until the sign-in lands), and Disconnect drops the stored
 * authorization. Agents see the hub's tools the moment it turns connected.
 */
export function McpHubsSection() {
  const { t } = useTranslation("integrations");
  const providers = useMcpHubProviders();
  if (providers.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {t("hubs.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hubs.subtitle")}</p>
      </div>
      <div className="flex flex-col gap-2">
        {providers.map((provider) => (
          <McpHubCard key={provider} provider={provider} />
        ))}
      </div>
    </section>
  );
}

function McpHubCard({ provider }: { provider: string }) {
  const { t } = useTranslation("integrations");
  const toolkits = useIntegrationToolkits(provider, true);
  const connections = useIntegrationConnections(provider, true);
  const disconnect = useDisconnectIntegration(provider);
  const { state: connectState, connect } = useConnectFlow({
    autoGrant: false,
    provider,
  });

  const hub = toolkits.data?.[0];
  const name = hub?.name ?? provider;
  const connected = !!connections.data?.some((c) => c.status === "active");
  const busy = connectState !== null || disconnect.isPending;

  return (
    <RowCard
      surface="base"
      media={
        <span className="size-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">
            {name.charAt(0).toUpperCase()}
          </span>
        </span>
      }
      title={name}
      description={hub?.description ?? t("hubs.description")}
      action={
        connected ? (
          <span className="inline-flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-xs font-medium">
              <Check className="size-3" />
              {t("hubs.connected")}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => disconnect.mutate(provider)}
              className="h-7 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-secondary disabled:opacity-60"
            >
              {disconnect.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                t("hubs.disconnect")
              )}
            </button>
          </span>
        ) : busy ? (
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-secondary text-muted-foreground text-xs font-medium shrink-0">
            <Loader2 className="size-3 animate-spin" />
            {t("hubs.connecting")}
          </span>
        ) : (
          <RowCardButton
            label={t("hubs.connect")}
            onClick={() => void connect(provider)}
            icon={<ExternalLink className="size-3" />}
            iconPosition="trailing"
          />
        )
      }
    />
  );
}
