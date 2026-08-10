import {
  Button,
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
} from "@houston-ai/core";
import { useMemo } from "react";
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
import { orderFeaturedFirst } from "../provider-browser/provider-filtering";
import { providerModels } from "../provider-browser/provider-grouping";

/**
 * The hub's Available provider surface: a two-column grid of flat
 * {@link CatalogRow}s — full-color brand mark, name, a muted line leading with
 * the live model count then the friendly cost prose. Free-text search AND the
 * billing facet ({@link ProviderQuickFilterChips}, riding the page header's
 * tools zone) are applied by the page before the list arrives, so the heading
 * count and this grid can never disagree; the pane owns only the featured-first
 * ordering. The row BODY opens the provider modal (connect, sign-out, its model
 * list); the ghost `+` connects directly, flipping to a Cancel pill while that
 * provider's OAuth is in flight so a stuck sign-in can always be aborted. Only
 * NOT-connected providers browse here; connected ones live in the strip above
 * it.
 */
export function ProvidersPane({
  providers,
  connections,
  catalog,
  onOpen,
}: {
  /** The NOT-connected providers, already narrowed by the page's query and
   *  billing facet (the connected ones render in the strip). */
  providers: readonly ProviderInfo[];
  connections: ProviderConnections;
  catalog: HubCatalog;
  onOpen: (provider: ProviderInfo) => void;
}) {
  const { t } = useTranslation("aiHub");

  const filtered = useMemo(() => orderFeaturedFirst(providers), [providers]);

  if (!connections.ready) {
    return <ProviderBrowserSkeleton count={providers.length || 8} />;
  }

  return (
    <div className="flex flex-col gap-4">
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
