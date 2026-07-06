import { AsyncButton, Button } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import type { ProviderInfo } from "../../lib/providers";
import { ProviderGlyph } from "../shell/provider-logos";
import { LiveStatus, ModelMark } from "./hub-badges";
import { providerDescriptionKey, providerModels } from "./provider-grouping";

/** Multi-model gateways lead their copy with the count; subscriptions stay clean. */
const GATEWAY_MODEL_THRESHOLD = 15;

interface ProviderCardProps {
  provider: ProviderInfo;
  catalog: HubCatalog;
  connected: boolean;
  connecting: boolean;
  onOpen: (provider: ProviderInfo) => void;
  onConnect: (provider: ProviderInfo) => void;
  /** Abort an in-flight sign-in so a user who closed the OAuth tab isn't
   *  stuck watching a spinner with no way out. */
  onCancel: (provider: ProviderInfo) => void;
}

/**
 * A marketplace tile for one provider. The card itself is NOT clickable — every
 * action lives in the footer as a real focusable button: an available provider
 * offers a primary Connect pill plus a ghost "See more" that opens the detail
 * (`onOpen`); while a sign-in is in flight the pill becomes a Cancel button
 * (spinner + visible label, never a dead disabled spinner) that aborts the
 * login (`onCancel`); a connected provider swaps Connect for a live status
 * readout and keeps "See more" to reopen its modal. Every card wears the same calm gray
 * surface + hairline ring — connected and available look identical, differing
 * only in the footer (live status vs Connect pill). No accent, no glow.
 */
export function ProviderCard({
  provider,
  catalog,
  connected,
  connecting,
  onOpen,
  onConnect,
  onCancel,
}: ProviderCardProps) {
  const { t } = useTranslation("aiHub");

  // Multi-model gateways (OpenRouter, OpenCode, Bedrock, Google...) lead their
  // description with the number of models they unlock; small subscription
  // providers (Anthropic, OpenAI, Copilot) get no lead.
  const modelCount = providerModels(catalog, provider).length;
  const leadCount = modelCount >= GATEWAY_MODEL_THRESHOLD ? modelCount : 0;

  const seeMore = (
    <Button
      size="sm"
      variant="ghost"
      className="flex-1"
      onClick={() => onOpen(provider)}
    >
      {t("card.seeMore")}
    </Button>
  );

  return (
    <div className="ht-hairline flex flex-col rounded-2xl bg-secondary p-[18px] transition-colors duration-200 hover:bg-accent">
      <div className="flex items-center gap-3">
        <ModelMark
          size="lg"
          mark={<ProviderGlyph providerId={provider.id} />}
        />
        <p className="text-[15px] font-medium text-foreground">
          {provider.name}
        </p>
      </div>
      <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
        {leadCount > 0 ? (
          <span className="font-semibold text-foreground">
            {t("card.models", { count: leadCount })}.{" "}
          </span>
        ) : null}
        {t(`providers.${providerDescriptionKey(provider.id)}.description`)}
      </p>
      <div className="mt-4 flex items-center gap-2">
        {connected ? (
          <>
            <span className="flex-1">
              <LiveStatus label={t("card.connected")} />
            </span>
            {seeMore}
          </>
        ) : (
          <>
            {connecting ? (
              <AsyncButton
                size="sm"
                variant="secondary"
                spinner={false}
                className="flex-1"
                onClick={() => onCancel(provider)}
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {t("card.cancel")}
              </AsyncButton>
            ) : (
              <AsyncButton
                size="sm"
                spinner={false}
                className="flex-1"
                onClick={() => onConnect(provider)}
              >
                {t("card.connect")}
              </AsyncButton>
            )}
            {seeMore}
          </>
        )}
      </div>
    </div>
  );
}
