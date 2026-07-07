/**
 * One provider's way to run a model, in a model modal's "Get it through" list.
 * A hub-local row (NOT the shared `RowCard`, which draws its own media box) that
 * pairs the provider's colorful `BrandMark` tile with its name, matching the
 * ledger. Shows either a per-1M price line or a subscription label. Not
 * connected -> a Connect pill; connected -> a live status and a row that opens
 * the provider modal.
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { CatalogOffer } from "../../lib/ai-hub/catalog-types.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import { RowCardButton } from "../cards/row-card-button.tsx";
import { BrandMark } from "../provider-browser/brand-mark.tsx";
import { formatPrice } from "./format.ts";
import { LiveStatus, PriceText } from "./hub-badges.tsx";

export function ModelOfferRow({
  offer,
  provider,
  connections,
  onOpenProvider,
}: {
  offer: CatalogOffer;
  provider: ProviderInfo;
  connections: ProviderConnections;
  onOpenProvider?: (provider: ProviderInfo) => void;
}) {
  const { t } = useTranslation("aiHub");
  const priced =
    !offer.subscription &&
    (offer.costInput != null || offer.costOutput != null);
  const description = priced ? (
    <PriceText
      text={t("model.offers.pricing", {
        input: formatPrice(offer.costInput),
        output: formatPrice(offer.costOutput),
      })}
    />
  ) : (
    t("model.offers.subscription")
  );

  // A boxless logo lockup + copy + action, on the modal's grey slab.
  const row = (action: ReactNode) => (
    <span className="flex w-full min-w-0 items-center gap-3 rounded-xl bg-secondary px-3 py-2.5">
      <BrandMark providerId={provider.id} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-[13px] text-foreground">
          {provider.name}
        </span>
        <span className="text-[11px] text-foreground/70">{description}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">{action}</span>
    </span>
  );

  if (connections.isConnected(provider)) {
    return (
      <button
        type="button"
        onClick={onOpenProvider ? () => onOpenProvider(provider) : undefined}
        disabled={!onOpenProvider}
        className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        {row(<LiveStatus label={t("card.connected")} />)}
      </button>
    );
  }

  return row(
    <RowCardButton
      label={t("card.connect")}
      loading={connections.busy[provider.id] === "connecting"}
      // Until the first status probe resolves we can't know this offer isn't
      // already connected, so don't offer an actionable Connect yet.
      disabled={!connections.ready}
      onClick={() => connections.connect(provider)}
    />,
  );
}
