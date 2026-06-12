/**
 * Transient typed-provider-error variants — rate-limited, usage-limit-paused,
 * network, provider-internal, malformed-response. They share the "wait"
 * recovery shape; differing only in icon + body copy + CTA (rate-limited and
 * usage-limit-paused offer "switch model", the network/internal ones a
 * status-page link).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangleIcon,
  Clock,
  ServerCrashIcon,
  TimerResetIcon,
  WifiOffIcon,
} from "lucide-react";
import type { ProviderError } from "@houston-ai/chat";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
import {
  ErrorCard,
  RetryButton,
  StatusPageButton,
  providerLabel,
} from "./shared";

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
  const [retrying, setRetrying] = useState(false);
  const body = error.retry_after_seconds
    ? t("providerError.rateLimited.bodyWithRetry", {
        provider,
        seconds: error.retry_after_seconds,
      })
    : t("providerError.rateLimited.body", { provider });
  const retry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<Clock className="size-5" />}
        title={t("providerError.rateLimited.title")}
        description={body}
        action={
          <>
            {onRetry && (
              <RowCardButton
                label={t("providerError.rateLimited.retry")}
                onClick={retry}
                loading={retrying}
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
 * Distinct from RateLimited: retrying now fails, so there is NO retry CTA —
 * the user waits for the reset. We surface the reset time when the engine
 * could resolve it, and offer "switch model" as the one way to keep going
 * (a different provider has its own limit).
 */
export function UsageLimitPausedCard({
  error,
  onSwitchModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "usage_limit_paused" }>;
}) {
  const { t } = useTranslation("shell");
  const body = error.resets_at
    ? t("providerError.usageLimitPaused.bodyWithReset", { time: error.resets_at })
    : t("providerError.usageLimitPaused.body");
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<TimerResetIcon className="size-5" />}
        title={t("providerError.usageLimitPaused.title")}
        description={body}
        action={
          <>
            {onSwitchModel && (
              <RowCardButton
                label={t("providerError.usageLimitPaused.switchModel")}
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

export function NetworkUnreachableCard({
  error,
  onRetry,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "network_unreachable" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <ErrorCard
      icon={<WifiOffIcon className="size-5" />}
      title={t("providerError.networkUnreachable.title", { provider })}
      body={t("providerError.networkUnreachable.body", { provider })}
    >
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
    </ErrorCard>
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
    <ErrorCard
      icon={<ServerCrashIcon className="size-5" />}
      title={t("providerError.providerInternal.title", { provider })}
      body={t("providerError.providerInternal.body", { provider })}
    >
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
    </ErrorCard>
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
    <ErrorCard
      icon={<AlertTriangleIcon className="size-5" />}
      title={t("providerError.malformedResponse.title")}
      body={t("providerError.malformedResponse.body", { provider })}
    >
      {onRetry && (
        <RetryButton
          onRetry={onRetry}
          label={t("providerError.malformedResponse.retry")}
        />
      )}
    </ErrorCard>
  );
}
