import type { ProviderError } from "@houston-ai/chat";
import { AlertTriangleIcon, ServerCrashIcon, WifiOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowCard } from "../../cards/row-card";
import { providerLabel, RetryButton, StatusPageButton } from "./shared";

interface BaseProps {
  onRetry?: () => Promise<void> | void;
}

export function NetworkUnreachableCard({
  error,
  onRetry,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "network_unreachable" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  const local = error.provider === "openai-compatible";
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<WifiOffIcon className="size-5" />}
        title={
          local
            ? t("providerError.networkUnreachable.localTitle")
            : t("providerError.networkUnreachable.title", { provider })
        }
        description={
          local
            ? t("providerError.networkUnreachable.localBody")
            : t("providerError.networkUnreachable.body", { provider })
        }
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
