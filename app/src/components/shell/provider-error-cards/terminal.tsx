import type { ProviderError } from "@houston-ai/chat";
import { CloudOffIcon, RefreshCwIcon, WrenchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowCard } from "../../cards/row-card";
import { providerLabel, ReportBugButton, RetryButton } from "./shared";

interface BaseProps {
  onRetry?: () => Promise<void> | void;
}

export function SessionResumeMissingCard({
  error,
  onRetry,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "session_resume_missing" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<RefreshCwIcon className="size-5" />}
        title={t("providerError.sessionResumeMissing.title")}
        description={t("providerError.sessionResumeMissing.body", { provider })}
        action={
          onRetry && (
            <RetryButton
              onRetry={onRetry}
              label={t("providerError.sessionResumeMissing.tryAgain")}
            />
          )
        }
      />
    </div>
  );
}

export function SpawnFailedCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "spawn_failed" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<WrenchIcon className="size-5" />}
        title={t("providerError.spawnFailed.title", { provider })}
        description={t("providerError.spawnFailed.body", { provider })}
        action={
          <ReportBugButton
            command={`provider_error:spawn_failed:${error.provider}`}
            details={error.message}
            label={t("providerError.spawnFailed.reportBug")}
          />
        }
      />
    </div>
  );
}

export function UnknownErrorCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "unknown" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  const raw = error.raw_excerpt.trim();
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<CloudOffIcon className="size-5" />}
        title={t("providerError.unknown.title")}
        description={
          raw ? (
            <>
              {t("providerError.unknown.body", { provider })}
              <span className="mt-1 block font-mono text-[10px] text-ink/50 [overflow-wrap:anywhere]">
                {t("providerError.unknown.rawLabel")}: {raw}
              </span>
            </>
          ) : (
            t("providerError.unknown.body", { provider })
          )
        }
        action={
          <ReportBugButton
            command={`provider_error:unknown:${error.provider}`}
            details={error.raw_excerpt}
            label={t("providerError.unknown.reportBug")}
          />
        }
      />
    </div>
  );
}
