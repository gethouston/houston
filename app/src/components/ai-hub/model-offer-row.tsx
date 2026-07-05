/**
 * One provider's way to run a model, in the "Get it through" list. Reuses the
 * shared `RowCard`: provider glyph, provider name, and either per-1M pricing or
 * a subscription label. Not connected → a Connect pill; connected → a success
 * dot and a row that opens the provider detail.
 */

import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { CatalogOffer } from "../../lib/ai-hub/catalog-types.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import { RowCard } from "../cards/row-card.tsx";
import { RowCardButton } from "../cards/row-card-button.tsx";
import { ProviderGlyph } from "../shell/provider-logos.tsx";
import { PriceText } from "./hub-badges.tsx";

export function ModelOfferRow({
  offer,
  provider,
  connections,
  onOpenProvider,
}: {
  offer: CatalogOffer;
  provider: ProviderInfo;
  connections: ProviderConnections;
  onOpenProvider: (provider: ProviderInfo) => void;
}) {
  const { t } = useTranslation("aiHub");
  const media = <ProviderGlyph providerId={provider.id} />;
  const description =
    !offer.subscription &&
    (offer.costInput != null || offer.costOutput != null) ? (
      <PriceText input={offer.costInput} output={offer.costOutput} />
    ) : (
      t("model.offers.subscription")
    );

  if (connections.isConnected(provider)) {
    return (
      <button
        type="button"
        onClick={() => onOpenProvider(provider)}
        className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RowCard
          media={media}
          title={provider.name}
          description={description}
          action={
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" />
              {t("card.connected")}
            </span>
          }
        />
      </button>
    );
  }

  return (
    <RowCard
      media={media}
      title={provider.name}
      description={description}
      action={
        <RowCardButton
          label={t("card.connect")}
          loading={connections.busy[provider.id] === "connecting"}
          // Until the first status probe resolves we can't know this offer isn't
          // already connected, so don't offer an actionable Connect yet.
          disabled={!connections.ready}
          onClick={() => connections.connect(provider)}
        />
      }
    />
  );
}
