import {
  Button,
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
  cn,
} from "@houston-ai/core";
import { CreditCard, Wallet } from "lucide-react";
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
  PROVIDER_QUICK_FILTERS,
  type ProviderQuickFilter,
  searchProviders,
} from "../provider-browser/provider-filtering";
import { providerModels } from "../provider-browser/provider-grouping";

/** The lucide glyph paired with each billing quick-filter facet. */
const FILTER_ICON: Record<
  Exclude<ProviderQuickFilter, "all">,
  typeof CreditCard
> = {
  subscription: CreditCard,
  payg: Wallet,
};

/**
 * The hub's Providers tab in the catalog grammar: the Subscription / Pay-as-you-go
 * billing toggles over a two-column grid of flat {@link CatalogRow}s — full-color
 * brand mark, name, a muted line leading with the live model count then the
 * friendly cost prose. Free-text search comes from the page's ONE search field
 * (the `query` prop); the pane owns only its billing facet. The row BODY opens
 * the provider modal (connect, sign-out, its model list); the ghost `+` connects
 * directly, flipping to a Cancel pill while that provider's OAuth is in flight so
 * a stuck sign-in can always be aborted. Only NOT-connected providers browse
 * here — connected ones live in the strip above the tabs.
 */
export function ProvidersPane({
  providers,
  query,
  connections,
  catalog,
  onOpen,
}: {
  /** The NOT-connected providers (the connected ones render in the strip). */
  providers: readonly ProviderInfo[];
  /** The page's single search query. */
  query: string;
  connections: ProviderConnections;
  catalog: HubCatalog;
  onOpen: (provider: ProviderInfo) => void;
}) {
  const { t } = useTranslation("aiHub");
  const [filter, setFilter] = useState<ProviderQuickFilter>("all");

  // Billing facet -> the page's free-text query -> featured pinned first (the
  // same pipeline the onboarding/migration ProviderBrowser runs).
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
      <fieldset
        aria-label={t("providers.filter.label")}
        className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0"
      >
        {PROVIDER_QUICK_FILTERS.map((key) => {
          const Icon = FILTER_ICON[key];
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? "all" : key)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/20",
                active
                  ? "border-ink bg-ink text-input"
                  : "border-line bg-chip text-ink hover:bg-card-hover",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {t(`providers.filter.${key}`)}
            </button>
          );
        })}
      </fieldset>

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
