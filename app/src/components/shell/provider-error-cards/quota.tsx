/**
 * Quota / model-availability variants — the "pay or switch" outcomes.
 * QuotaExhausted names the reset time when the provider gives one and offers a
 * "switch provider" CTA; ModelUnavailable offers a one-click "switch to the
 * suggested fallback" (applied directly on the same provider, no picker) plus a
 * "pick another model" CTA that pops the model picker; ContextOverflow (the
 * chat outgrew the model's window) offers the picker so the user can move the
 * conversation onto a larger-window model. All render on the unified `RowCard`
 * (HOU-467), with their CTAs mounted as `RowCardButton`s in the card's action
 * slot.
 */

import type { ProviderError } from "@houston-ai/chat";
import { AlertTriangleIcon, XCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
import { providerLabel } from "./shared";

interface BaseProps {
  /** Open the model picker so the user can choose a different model/provider. */
  onSwitchModel?: () => void;
}

export function QuotaExhaustedCard({
  error,
  onSwitchModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "quota_exhausted" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<XCircleIcon className="size-5" />}
        title={t("providerError.quotaExhausted.title")}
        description={
          error.resets_at
            ? t("providerError.quotaExhausted.bodyWithReset", {
                provider,
                time: error.resets_at,
              })
            : t("providerError.quotaExhausted.body", { provider })
        }
        action={
          onSwitchModel && (
            <RowCardButton
              variant="outline"
              label={t("providerError.quotaExhausted.switchProvider")}
              onClick={onSwitchModel}
            />
          )
        }
      />
    </div>
  );
}

export function ContextOverflowCard({
  error,
  onSwitchModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "context_overflow" }>;
}) {
  const { t } = useTranslation("shell");
  // Name the model when the wire carried it, else fall back to the provider's
  // display name — the sentence must always name WHAT ran out of room.
  const model = error.model ?? providerLabel(error.provider);
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<AlertTriangleIcon className="size-5" />}
        title={t("providerError.contextOverflow.title")}
        description={t("providerError.contextOverflow.body", { model })}
        action={
          onSwitchModel && (
            <RowCardButton
              variant="outline"
              label={t("providerError.contextOverflow.switchModel")}
              onClick={onSwitchModel}
            />
          )
        }
      />
    </div>
  );
}

export function ModelUnavailableCard({
  error,
  onSwitchModel,
  onApplyModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "model_unavailable" }>;
  /** Apply the suggested fallback model directly (one click, no picker). */
  onApplyModel?: (model: string) => void;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  const fallback = error.suggested_fallback;
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<AlertTriangleIcon className="size-5" />}
        title={t("providerError.modelUnavailable.title")}
        description={t("providerError.modelUnavailable.body", {
          provider,
          model: error.model,
        })}
        action={
          <>
            {fallback && onApplyModel && (
              <RowCardButton
                label={t("providerError.modelUnavailable.switchToFallback", {
                  model: fallback,
                })}
                onClick={() => onApplyModel(fallback)}
              />
            )}
            {onSwitchModel && (
              <RowCardButton
                variant="outline"
                label={t("providerError.modelUnavailable.pickAnother")}
                onClick={onSwitchModel}
              />
            )}
          </>
        }
      />
    </div>
  );
}
