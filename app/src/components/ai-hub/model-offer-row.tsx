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

  const row = (action: ReactNode) => (
    <span className="flex w-full min-w-0 items-center gap-3 rounded-xl bg-chip px-3 py-2.5">
      <BrandMark providerId={provider.id} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-[13px] text-ink">
          {provider.name}
        </span>
        <span className="text-[11px] text-ink/70">{description}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">{action}</span>
    </span>
  );

  const connection = connections.connectionState(provider);

  if (connection === "connected") {
    return (
      <button
        type="button"
        onClick={onOpenProvider ? () => onOpenProvider(provider) : undefined}
        disabled={!onOpenProvider}
        className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default"
      >
        {row(<LiveStatus label={t("card.connected")} />)}
      </button>
    );
  }

  if (connection === "checking") {
    return row(
      <span className="px-2 text-[13px] text-ink-muted">
        {t("card.checking")}
      </span>,
    );
  }

  return row(
    <RowCardButton
      label={t("card.connect")}
      loading={connections.busy[provider.id] === "connecting"}
      disabled={!connections.ready}
      onClick={() => connections.connect(provider)}
    />,
  );
}
