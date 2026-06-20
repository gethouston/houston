/**
 * Transient typed-provider-error variants — rate-limited, network,
 * provider-internal, malformed-response. All four share the
 * "wait/retry" recovery shape; differing only in icon + body copy +
 * status-page CTA target.
 */

import type { ProviderError } from "@houston-ai/chat";
import {
  AlertTriangleIcon,
  Clock,
  ServerCrashIcon,
  WifiOffIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
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
