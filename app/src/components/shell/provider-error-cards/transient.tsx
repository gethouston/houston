/**
 * Transient typed-provider-error variants — rate-limited, usage-limit-paused,
 * network, provider-internal, malformed-response. They share the "wait"
 * recovery shape; rate-limited/network/internal offer a retry (and the
 * network/internal ones a status-page link), while usage-limit-paused is
 * informational — the user waits for the plan window to reset. All render on
 * the unified `RowCard` (HOU-467).
 */

import type { ProviderError } from "@houston-ai/chat";
import {
  AlertTriangleIcon,
  Clock,
  ServerCrashIcon,
  TimerResetIcon,
  WifiOffIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
import { providerLabel, RetryButton, StatusPageButton } from "./shared";

interface BaseProps {
  onRetry?: () => Promise<void> | void;
  onSwitchModel?: () => void;
}

export function RateLimitedCard({
  error,
  onRetry,
  onSwitchModel,
}: BaseProps & {
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
        }
      />
    </div>
  );
}

/**
 * Plan-window usage limit (Anthropic's 5-hour subscription session limit).
 * Distinct from RateLimited: retrying now fails, so there is no action — the
 * user just waits for the reset. We surface the reset time when the engine
 * could resolve it.
 */
export function UsageLimitPausedCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "usage_limit_paused" }>;
}) {
  const { t } = useTranslation("shell");
  const body = error.resets_at
    ? t("providerError.usageLimitPaused.bodyWithReset", {
        time: error.resets_at,
      })
    : t("providerError.usageLimitPaused.body");
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<TimerResetIcon className="size-5" />}
        title={t("providerError.usageLimitPaused.title")}
        description={body}
      />
    </div>
  );
}

export function NetworkUnreachableCard({
  error,
  onRetry,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "network_unreachable" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<WifiOffIcon className="size-5" />}
        title={t("providerError.networkUnreachable.title", { provider })}
        description={t("providerError.networkUnreachable.body", { provider })}
        action={
          <>
            {onRetry && (
              <RetryButton
                onRetry={onRetry}
                label={t("providerError.networkUnreachable.retry")}
              />
            )}
            <StatusPageButton
              provider={error.provider}
              label={t("providerError.networkUnreachable.checkStatus")}
            />
          </>
        }
      />
    </div>
  );
}

export function ProviderInternalCard({
  error,
  onRetry,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "provider_internal" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<ServerCrashIcon className="size-5" />}
        title={t("providerError.providerInternal.title", { provider })}
        description={t("providerError.providerInternal.body", { provider })}
        action={
          <>
            {onRetry && (
              <RetryButton
                onRetry={onRetry}
                label={t("providerError.providerInternal.retry")}
              />
            )}
            <StatusPageButton
              provider={error.provider}
              label={t("providerError.providerInternal.checkStatus")}
            />
          </>
        }
      />
    </div>
  );
}

export function MalformedResponseCard({
  error,
  onRetry,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "malformed_response" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<AlertTriangleIcon className="size-5" />}
        title={t("providerError.malformedResponse.title")}
        description={t("providerError.malformedResponse.body", { provider })}
        action={
          onRetry && (
            <RetryButton
              onRetry={onRetry}
              label={t("providerError.malformedResponse.retry")}
            />
          )
        }
      />
    </div>
  );
}
