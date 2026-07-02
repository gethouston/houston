import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useDisconnectIntegration,
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { AvailableAppRow, ConnectedAppRow } from "./integrations-app-card";
import { filterCatalog, INTEGRATION_PROVIDER } from "./integrations-tab-model";

interface Props {
  /** Hand off a connect/reconnect click to the parent's OAuth-poll runner. */
  onAddApp: (toolkit: string) => void;
  /** Toolkit slug currently mid-OAuth (spinner on its row), if any. */
  connectingToolkit?: string | null;
}

/** Connected apps + a searchable catalog of connectable apps. Real names,
 *  logos, and descriptions — never machine slugs. */
export function IntegrationsConnections({
  onAddApp,
  connectingToolkit,
}: Props) {
  const { t } = useTranslation("agents");
  const [query, setQuery] = useState("");
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const disconnect = useDisconnectIntegration(INTEGRATION_PROVIDER);

  const items = connections.data ?? [];
  const bySlug = useMemo(
    () =>
      new Map<string, IntegrationToolkit>(
        (catalog.data ?? []).map((tk) => [tk.slug, tk]),
      ),
    [catalog.data],
  );
  const connectedSlugs = useMemo(
    () => new Set(items.map((c) => c.toolkit)),
    [items],
  );
  const available = useMemo(
    () =>
      filterCatalog({
        catalog: catalog.data ?? [],
        query,
        connected: connectedSlugs,
      }),
    [catalog.data, query, connectedSlugs],
  );
  const searching = query.trim().length > 0;

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
          <ul className="flex flex-col gap-1.5">
            {items.map((c) => (
              <ConnectedAppRow
                key={c.connectionId || c.toolkit}
                connection={c}
                toolkit={bySlug.get(c.toolkit)}
                onReconnect={() => onAddApp(c.toolkit)}
                onDisconnect={() => disconnect.mutate(c.toolkit)}
                disconnecting={disconnect.isPending}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("integrations.addApps")}</h3>
        <label className="flex h-9 items-center gap-2 rounded-full border border-black/15 bg-background px-3.5 shadow-sm focus-within:border-black/25">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("integrations.searchApps")}
            aria-label={t("integrations.searchApps")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        {catalog.isLoading ? (
          <p className="text-sm text-muted-foreground">
            {t("integrations.loading")}
          </p>
        ) : available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {searching
              ? t("integrations.noResults", { query: query.trim() })
              : t("integrations.noApps")}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {available.map((tk) => (
                <AvailableAppRow
                  key={tk.slug}
                  toolkit={tk}
                  connecting={connectingToolkit === tk.slug}
                  disabled={
                    connectingToolkit != null && connectingToolkit !== tk.slug
                  }
                  onConnect={() => onAddApp(tk.slug)}
                />
              ))}
            </ul>
            {!searching && (catalog.data?.length ?? 0) > available.length && (
              <p className="text-xs text-muted-foreground">
                {t("integrations.searchHint", {
                  count: catalog.data?.length ?? 0,
                })}
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
