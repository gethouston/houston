import { formatLocalDateTime } from "@houston/sdk";
import type { ProviderError } from "@houston-ai/chat";
import { Clock, TimerResetIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
import { providerLabel, RetryButton } from "./shared";

interface LimitProps {
  onRetry?: () => Promise<void> | void;
  onSwitchModel?: () => void;
}

export function RateLimitedCard({
  error,
  onRetry,
  onSwitchModel,
}: LimitProps & {
  error: Extract<ProviderError, { kind: "rate_limited" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  const body = error.retry_after_seconds
    ? t("providerError.rateLimited.bodyWithRetry", {
        provider,
        seconds: error.retry_after_seconds,
      })
    : t("providerError.rateLimited.body", { provider });
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<Clock className="size-5" />}
        title={t("providerError.rateLimited.title")}
        description={body}
        action={
          onRetry || onSwitchModel ? (
            <>
              {onRetry && (
                <RetryButton
                  onRetry={onRetry}
                  label={t("providerError.rateLimited.retry")}
                />
              )}
              {onSwitchModel && (
                <RowCardButton
                  label={t("providerError.rateLimited.switchModel")}
                  onClick={onSwitchModel}
                  variant="outline"
                />
              )}
            </>
          ) : undefined
        }
      />
    </div>
  );
}

export function UsageLimitPausedCard({
  error,
  onSwitchModel,
}: Pick<LimitProps, "onSwitchModel"> & {
  error: Extract<ProviderError, { kind: "usage_limit_paused" }>;
}) {
  const { t, i18n } = useTranslation("shell");
  const time =
    error.resets_at && Number.isFinite(Date.parse(error.resets_at))
      ? formatLocalDateTime(error.resets_at, i18n.language)
      : null;
  const body = time
    ? t("providerError.usageLimitPaused.bodyWithReset", { time })
    : t("providerError.usageLimitPaused.body");
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<TimerResetIcon className="size-5" />}
        title={t("providerError.usageLimitPaused.title")}
        description={body}
        action={
          onSwitchModel ? (
            <RowCardButton
              label={t("providerError.rateLimited.switchModel")}
              onClick={onSwitchModel}
              variant="outline"
            />
          ) : undefined
        }
      />
    </div>
  );
}
