import {
  Button,
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
} from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import {
  providerCostLine,
  providerDescription,
} from "../../lib/provider-overrides";
import type { ProviderInfo } from "../../lib/providers";
import { BrandMark } from "../provider-browser/brand-mark";
import {
  ProviderBrowserSkeleton,
  ProviderEmpty,
} from "../provider-browser/provider-browser-sections";
import {
  filterByQuickFilter,
  orderFeaturedFirst,
  type ProviderQuickFilter,
  searchProviders,
} from "../provider-browser/provider-filtering";
import { ProviderFilters } from "../provider-browser/provider-filters";
import { providerModels } from "../provider-browser/provider-grouping";

/**
 * The hub's Providers tab in the catalog grammar: a controls row (search +
 * the Subscription / Pay-as-you-go billing toggles) over a two-column grid of
 * flat {@link CatalogRow}s — full-color brand mark, name, a muted line leading
 * with the live model count then the friendly cost prose. The row BODY opens
 * the provider modal (connect, sign-out, its model list); the ghost `+`
 * connects directly, flipping to a Cancel pill while that provider's OAuth is
 * in flight so a stuck sign-in can always be aborted. Only NOT-connected
 * providers browse here — connected ones live in the strip above the tabs.
 */
export function ProvidersPane({
  providers,
  connections,
  catalog,
  onOpen,
}: {
  /** The NOT-connected providers (the connected ones render in the strip). */
  providers: readonly ProviderInfo[];
  connections: ProviderConnections;
  catalog: HubCatalog;
  onOpen: (provider: ProviderInfo) => void;
}) {
  const { t } = useTranslation("aiHub");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProviderQuickFilter>("all");

  // Quick filter -> free-text query -> featured pinned first (the same
  // pipeline the onboarding/migration ProviderBrowser runs).
  const filtered = useMemo(
    () =>
      orderFeaturedFirst(
        searchProviders(filterByQuickFilter(providers, filter), query),
      ),
    [providers, filter, query],
  );

  if (!connections.ready) {
    return <ProviderBrowserSkeleton count={providers.length || 8} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ProviderFilters
        query={query}
        setQuery={setQuery}
        filter={filter}
        setFilter={setFilter}
      />

      {filtered.length === 0 ? (
        <ProviderEmpty
          title={t("providers.empty.title")}
          description={t("providers.empty.description")}
        />
      ) : (
        <CatalogGrid>
          {filtered.map((provider) => {
            const connecting = connections.busy[provider.id] === "connecting";
            const modelCount = providerModels(catalog, provider).length;
            const cost =
              providerCostLine(provider.id) ?? providerDescription(provider.id);
            return (
              <CatalogRow
                key={provider.id}
                icon={<BrandMark providerId={provider.id} size="lg" />}
                title={provider.name}
                description={
                  modelCount > 0
                    ? `${t("card.models", { count: modelCount })} · ${cost}`
                    : cost
                }
                onClick={() => onOpen(provider)}
                action={
                  connecting ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => connections.cancel(provider)}
                    >
                      {t("card.cancel")}
                    </Button>
                  ) : (
                    <CatalogAddButton
                      label={t("card.connectName", { name: provider.name })}
                      onClick={() => connections.connect(provider)}
                    />
                  )
                }
              />
            );
          })}
        </CatalogGrid>
      )}
    </div>
  );
}
