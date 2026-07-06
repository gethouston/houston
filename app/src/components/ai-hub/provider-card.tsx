import { AsyncButton, Button } from "@houston-ai/core";
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import type { ProviderInfo } from "../../lib/providers";
import { ProviderGlyph } from "../shell/provider-logos";
import { ModelMark } from "./hub-badges";
import { providerDescriptionKey, providerModels } from "./provider-grouping";

/** Multi-model gateways lead their copy with the count; subscriptions stay clean. */
const GATEWAY_MODEL_THRESHOLD = 15;

interface ProviderCardProps {
  provider: ProviderInfo;
  catalog: HubCatalog;
  connected: boolean;
  connecting: boolean;
  signingOut: boolean;
  onOpen: (provider: ProviderInfo) => void;
  onConnect: (provider: ProviderInfo) => void;
  onCancel: (provider: ProviderInfo) => void;
  onSignOut: (provider: ProviderInfo) => void;
}

/**
 * A marketplace tile for one provider. The card itself is NOT clickable — every
 * action lives in the footer as a real focusable button: an available provider
 * offers a primary Connect pill plus a ghost "See more" that opens the detail
 * (`onOpen`); a connected provider swaps Connect for a ghost "Sign out" button
 * (`onSignOut`, opening the shared confirm) and keeps "See more" to reopen its
 * modal. Every card wears the same calm gray surface + hairline ring — connected
 * and available look identical, differing only in the footer (Sign out vs
 * Connect pill). No accent, no glow, no live dot.
 */
export function ProviderCard({
  provider,
  catalog,
  connected,
  connecting,
  signingOut,
  onOpen,
  onConnect,
  onCancel,
  onSignOut,
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
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              disabled={signingOut}
              onClick={() => onSignOut(provider)}
            >
              {t("card.signOut")}
            </Button>
            {seeMore}
          </>
        ) : (
          <>
            <AsyncButton
              // While connecting the button stays clickable and, on hover, flips
              // to Cancel — so a stuck or unwanted sign-in can be aborted and
              // retried instead of the user waiting out a dead spinner.
              size="sm"
              spinner={false}
              className="group/connect relative flex-1"
              aria-label={connecting ? t("card.cancel") : undefined}
              onClick={() =>
                connecting ? onCancel(provider) : onConnect(provider)
              }
            >
              {connecting ? (
                <>
                  {/* Resting: spinner + "Connecting" — fades out on hover. */}
                  <span className="flex items-center justify-center gap-1.5 transition-opacity group-hover/connect:opacity-0">
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    {t("card.connecting")}
                  </span>
                  {/* Hover: Cancel — click aborts so the user can retry. */}
                  <span className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 transition-opacity group-hover/connect:opacity-100">
                    <X className="size-3.5" aria-hidden="true" />
                    {t("card.cancel")}
                  </span>
                </>
              ) : (
                t("card.connect")
              )}
            </AsyncButton>
            {seeMore}
          </>
        )}
      </div>
    </div>
  );
}
