/**
 * Transient typed-provider-error variants — rate-limited, network,
 * provider-internal, malformed-response. All four share the
 * "wait/retry" recovery shape; differing only in icon + body copy +
 * status-page CTA target.
 */

import type { ProviderError } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import {
  AlertTriangleIcon,
  ServerCrashIcon,
  TimerIcon,
  WifiOffIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ErrorCard,
  providerLabel,
  RetryButton,
  StatusPageButton,
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
  const body = error.retry_after_seconds
    ? t("providerError.rateLimited.bodyWithRetry", {
        provider,
        seconds: error.retry_after_seconds,
      })
    : t("providerError.rateLimited.body", { provider });
  return (
    <ErrorCard
      icon={<TimerIcon className="size-5" />}
      title={t("providerError.rateLimited.title")}
      body={body}
    >
      {onRetry && (
        <RetryButton
          onRetry={onRetry}
          label={t("providerError.rateLimited.retry")}
        />
      )}
      {onSwitchModel && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 rounded-full px-3 text-xs"
          onClick={onSwitchModel}
        >
          {t("providerError.rateLimited.switchModel")}
        </Button>
      )}
    </ErrorCard>
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
