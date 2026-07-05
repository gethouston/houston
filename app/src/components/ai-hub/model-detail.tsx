/**
 * The model detail: who makes it, what it can do (spec chips), and the key
 * "Get it through" section listing every provider that offers it with a Connect
 * action. Offers resolve to their connect card (the two OpenCode gateways
 * collapse into one) and sort connected-first via `sortOffers`.
 */

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections.ts";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import type { ProviderInfo } from "../../lib/providers.ts";
import {
  formatReleaseDate,
  formatTokens,
  labName,
  sortOffers,
} from "./format.ts";
import { ReasoningBadge, SpecValueChip, VisionBadge } from "./hub-badges.tsx";
import { ModelOfferRow } from "./model-offer-row.tsx";
import { connectCardByGatewayId } from "./provider-grouping.ts";

const ENTER = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
};

export function ModelDetail({
  model,
  connections,
  onBack,
  onOpenProvider,
}: {
  model: CatalogModel;
  connections: ProviderConnections;
  onBack: () => void;
  onOpenProvider: (provider: ProviderInfo) => void;
}) {
  const { t, i18n } = useTranslation("aiHub");

  // An offer's gateway id (`opencode`, `amazon-bedrock`, …) resolves to the card
  // that connects it (the merged OpenCode account stands in for both its
  // gateways) via the shared reverse map.
  const cardByGateway = useMemo(connectCardByGatewayId, []);

  const providerByOffer = new Map(
    model.offers
      .map((offer) => [offer, cardByGateway.get(offer.providerId)] as const)
      .filter(
        (entry): entry is [(typeof model.offers)[number], ProviderInfo] =>
          entry[1] != null,
      ),
  );
  const offers = sortOffers([...providerByOffer.keys()], (offer) => {
    const provider = providerByOffer.get(offer);
    return provider ? connections.isConnected(provider) : false;
  });

  const specs = buildSpecs(model, i18n.language, t);

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-8 w-fit items-center gap-1 rounded-lg pr-2 pl-1 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t("model.back")}
      </button>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">{model.name}</h2>
        <span className="text-sm text-muted-foreground">
          {labName(model.lab)}
        </span>
        {model.description && (
          <p className="max-w-prose text-sm text-muted-foreground">
            {model.description}
          </p>
        )}
        {specs.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {specs.map((spec) => (
              <span key={spec.key}>{spec.node}</span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium text-foreground">
            {t("model.offers.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("model.offers.subtitle", { model: model.name })}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {offers.map((offer) => {
              const provider = providerByOffer.get(offer);
              if (!provider) return null;
              return (
                <motion.div key={offer.providerId} layout {...ENTER}>
                  <ModelOfferRow
                    offer={offer}
                    provider={provider}
                    connections={connections}
                    onOpenProvider={onOpenProvider}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** The spec chips to show, in order, skipping anything the model lacks. */
function buildSpecs(
  model: CatalogModel,
  locale: string,
  t: (key: string) => string,
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
  if (model.reasoning)
    specs.push({ key: "reasoning", node: <ReasoningBadge /> });
  if (model.inputModalities.includes("image")) {
    specs.push({ key: "vision", node: <VisionBadge /> });
  }
  return specs;
}
