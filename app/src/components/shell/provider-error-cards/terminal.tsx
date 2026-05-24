/**
 * Terminal variants — session-resume failure, spawn failure, and the
 * Unknown catch-all. The unifying theme: the user can't simply "wait
 * and retry"; they need a fresh start, a reinstall, or to file a bug.
 */

import { useTranslation } from "react-i18next";
import { CloudOffIcon, RefreshCwIcon, WrenchIcon } from "lucide-react";
import type { ProviderError } from "@houston-ai/chat";
import {
  ErrorCard,
  ReportBugButton,
  RetryButton,
  providerLabel,
} from "./shared";

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
    <ErrorCard
      icon={<RefreshCwIcon className="size-5" />}
      title={t("providerError.sessionResumeMissing.title")}
      body={t("providerError.sessionResumeMissing.body", { provider })}
    >
      {onRetry && (
        <RetryButton
          onRetry={onRetry}
          label={t("providerError.sessionResumeMissing.startFresh")}
        />
      )}
    </ErrorCard>
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
    <ErrorCard
      icon={<WrenchIcon className="size-5" />}
      title={t("providerError.spawnFailed.title", { provider })}
      body={t("providerError.spawnFailed.body", { provider })}
    >
      <ReportBugButton
        command={`provider_error:spawn_failed:${error.provider}`}
        details={error.message}
        label={t("providerError.spawnFailed.reportBug")}
      />
    </ErrorCard>
  );
}

export function UnknownErrorCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "unknown" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <ErrorCard
      icon={<CloudOffIcon className="size-5" />}
      title={t("providerError.unknown.title")}
      body={t("providerError.unknown.body", { provider })}
    >
      <ReportBugButton
        command={`provider_error:unknown:${error.provider}`}
        details={error.raw_excerpt}
        label={t("providerError.unknown.reportBug")}
      />
    </ErrorCard>
  );
}
