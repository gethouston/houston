import { cn } from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useDisconnectIntegration,
  useIntegrationConnections,
} from "../../hooks/queries";
import {
  COMMON_TOOLKITS,
  INTEGRATION_PROVIDER,
} from "./integrations-tab-model";

const btn =
  "inline-flex items-center gap-2 rounded-full border border-black/15 bg-background px-4 h-9 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

interface Props {
  /** Hand off an "add this app" click to the parent's surfaced-action runner. */
  onAddApp: (toolkit: string) => void;
  /** Toolkit slug currently mid-OAuth (spinner on its button), if any. */
  connectingToolkit?: string | null;
}

/** Connected apps + one-click add. Platform mode: no account header — the user
 *  has no provider account, only per-app connections. */
export function IntegrationsConnections({
  onAddApp,
  connectingToolkit,
}: Props) {
  const { t } = useTranslation("agents");
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);

  const items: IntegrationConnection[] = connections.data ?? [];
  const connectedSlugs = new Set(items.map((c) => c.toolkit));

  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          {t("integrations.connectedApps")}
        </h3>
        {connections.isLoading ? (
          <p className="text-sm text-muted-foreground">
            {t("integrations.loading")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("integrations.noApps")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((c) => (
              <li
                key={c.connectionId || c.toolkit}
                className="flex items-center justify-between rounded-xl border border-black/5 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">{c.toolkit}</span>
                  {c.status !== "active" && (
                    <span className="text-xs text-muted-foreground">
                      {c.status === "pending"
                        ? t("integrations.statusPending")
                        : t("integrations.statusError")}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive hover:underline disabled:opacity-50"
                  onClick={() => disconnect.mutate(c.toolkit)}
                  disabled={disconnect.isPending}
                >
                  {t("integrations.disconnect")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("integrations.addApps")}</h3>
        <div className="flex flex-wrap gap-2">
          {COMMON_TOOLKITS.filter((tk) => !connectedSlugs.has(tk)).map((tk) => (
            <button
              key={tk}
              type="button"
              className={cn(btn, "h-8 px-3 text-xs")}
              onClick={() => onAddApp(tk)}
              disabled={connectingToolkit != null}
            >
              {connectingToolkit === tk && (
                <RefreshCw className="h-3 w-3 animate-spin" />
              )}
              {tk}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
