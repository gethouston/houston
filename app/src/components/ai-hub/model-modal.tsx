import { type ReactNode, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { analytics } from "../../lib/analytics.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import { BrandMark } from "../provider-browser/brand-mark.tsx";
import { connectCardByGatewayId } from "../provider-browser/provider-grouping.ts";
import { SpecChip } from "../spec-chip.tsx";
import {
  capabilityKeys,
  formatReleaseDate,
  formatTokens,
  labName,
  modelMarkId,
  sortOffers,
} from "./format.ts";
import { CapabilityChip } from "./hub-badges.tsx";
import { ModalShell } from "./modal-shell.tsx";
import { ModelOfferRow } from "./model-offer-row.tsx";

export function ModelModal({
  model,
  open,
  connections,
  onClose,
  onOpenProvider,
}: {
  model: CatalogModel;
  open: boolean;
  connections: ProviderConnections;
  onClose: () => void;
  onOpenProvider?: (provider: ProviderInfo) => void;
}) {
  const { t, i18n } = useTranslation(["aiHub", "common"]);
  useEffect(() => {
    if (open) analytics.track("model_viewed", { model: model.key });
  }, [open, model.key]);

  const cardByGateway = useMemo(connectCardByGatewayId, []);
  const providerByOffer = useMemo(
    () =>
      new Map(
        model.offers
          .map((offer) => [offer, cardByGateway.get(offer.providerId)] as const)
          .filter(
            (entry): entry is [(typeof model.offers)[number], ProviderInfo] =>
              entry[1] != null,
          ),
      ),
    [model.offers, cardByGateway],
  );
  const offers = sortOffers([...providerByOffer.keys()], (offer) => {
    const provider = providerByOffer.get(offer);
    return provider
      ? connections.connectionState(provider) !== "disconnected"
      : false;
  });

  const specs = buildSpecs(model, i18n.language, t);

  const header = (
    <div className="flex items-start gap-3">
      <BrandMark providerId={modelMarkId(model)} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-lg font-semibold text-ink tracking-[-0.01em]">
          {model.name}
        </span>
        <span className="text-[13px] text-ink-muted">{labName(model.lab)}</span>
      </div>
    </div>
  );

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeLabel={t("common:actions.close")}
      title={model.name}
      description={labName(model.lab)}
      header={header}
    >
      <div className="flex flex-col gap-6 px-5 py-5">
        {specs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {specs.map((spec) => (
              <span key={spec.key}>{spec.node}</span>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-[13px] font-medium text-ink">
              {t("model.offers.title")}
            </h3>
            <p className="text-xs text-ink-muted">
              {t("model.offers.subtitle", { model: model.name })}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {offers.map((offer) => {
              const provider = providerByOffer.get(offer);
              if (!provider) return null;
              return (
                <ModelOfferRow
                  key={offer.providerId}
                  offer={offer}
                  provider={provider}
                  connections={connections}
                  onOpenProvider={onOpenProvider}
                />
              );
            })}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function SpecValueChip({ label, value }: { label: string; value: string }) {
  return (
    <SpecChip>
      <span>{label}</span>
      <span className="font-mono text-ink tabular-nums">{value}</span>
    </SpecChip>
  );
}

function buildSpecs(
  model: CatalogModel,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): { key: string; node: ReactNode }[] {
  const specs: { key: string; node: ReactNode }[] = [];
  if (model.context != null) {
    specs.push({
      key: "context",
      node: (
        <SpecValueChip
          label={t("model.specs.context")}
          value={formatTokens(model.context)}
        />
      ),
    });
  }
  if (model.output != null) {
    specs.push({
      key: "output",
      node: (
        <SpecValueChip
          label={t("model.specs.output")}
          value={formatTokens(model.output)}
        />
      ),
    });
  }
  const knowledge = formatReleaseDate(model.knowledge, locale);
  if (knowledge) {
    specs.push({
      key: "knowledge",
      node: (
        <SpecValueChip label={t("model.specs.knowledge")} value={knowledge} />
      ),
    });
  }
  const released = formatReleaseDate(model.releaseDate, locale);
  if (released) {
    specs.push({
      key: "released",
      node: (
        <SpecValueChip label={t("model.specs.released")} value={released} />
      ),
    });
  }
  for (const cap of capabilityKeys(model)) {
    specs.push({
      key: `cap-${cap}`,
      node: <CapabilityChip label={t(`caps.${cap}`)} />,
    });
  }
  return specs;
}
