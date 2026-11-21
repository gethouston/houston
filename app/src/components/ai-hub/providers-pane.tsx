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

export function ProvidersPane({
  providers,
  connections,
  catalog,
  onOpen,
}: {
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
