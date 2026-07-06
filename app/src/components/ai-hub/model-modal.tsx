/**
 * The model modal: replaces the old model-detail PAGE. A blocking, centered
 * modal (via `ModalShell`) that shows a model's identity, its spec chips
 * (context / max output / knowledge / release + capability chips), and the
 * "Get it through" section — every provider that offers the model, connect
 * pill and all. Offers resolve to their connect card (the two OpenCode gateways
 * collapse into one) and sort connected-first via `sortOffers`.
 */

import { X } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import { ProviderGlyph } from "../shell/provider-logos.tsx";
import {
  capabilityKeys,
  formatReleaseDate,
  formatTokens,
  labName,
  sortOffers,
} from "./format.ts";
import { CapabilityChip, ModelMark, SpecChip } from "./hub-badges.tsx";
import { ModalShell } from "./modal-shell.tsx";
import { ModelOfferRow } from "./model-offer-row.tsx";
import { connectCardByGatewayId } from "./provider-grouping.ts";

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
  const { t, i18n } = useTranslation("aiHub");

  // An offer's gateway id resolves to the card that connects it (the merged
  // OpenCode account stands in for both its gateways) via the shared reverse map.
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
    return provider ? connections.isConnected(provider) : false;
  });

  const specs = buildSpecs(model, i18n.language, t);

  const header = (
    <div className="flex items-start gap-3 px-5 pt-5 pb-4">
      <ModelMark mark={<ProviderGlyph providerId={model.lab} />} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-lg font-semibold text-foreground tracking-[-0.01em]">
          {model.name}
        </span>
        <span className="text-[13px] text-muted-foreground">
          {labName(model.lab)}
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("card.cancel")}
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <ModalShell
      open={open}
      onClose={onClose}
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
            <h3 className="text-[13px] font-medium text-foreground">
              {t("model.offers.title")}
            </h3>
            <p className="text-xs text-muted-foreground">
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

/** A single spec chip: a muted label with a mono, tabular value beside it. */
function SpecValueChip({ label, value }: { label: string; value: string }) {
  return (
    <SpecChip>
      <span>{label}</span>
      <span className="font-mono text-foreground tabular-nums">{value}</span>
    </SpecChip>
  );
}

/** The spec chips to show, in order, skipping anything the model lacks. */
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
