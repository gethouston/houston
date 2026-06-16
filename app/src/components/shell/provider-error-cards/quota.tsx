/**
 * Quota / model-availability variants — these are the "pay or switch"
 * outcomes. CTAs lean on `tauriSystem.openUrl` to drop the user into
 * the right provider console.
 */

import { useTranslation } from "react-i18next";
import { AlertTriangleIcon, XCircleIcon } from "lucide-react";
import { Button } from "@houston-ai/core";
import type { ProviderError } from "@houston-ai/chat";
import { tauriSystem } from "../../../lib/tauri";
import { ErrorCard, providerLabel } from "./shared";

export function QuotaExhaustedCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "quota_exhausted" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <ErrorCard
      icon={<XCircleIcon className="size-5" />}
      title={t("providerError.quotaExhausted.title")}
      body={t("providerError.quotaExhausted.body", { provider })}
    >
      {error.upgrade_url && (
        <Button
          size="sm"
          className="h-8 gap-2 rounded-full px-3 text-xs"
          onClick={() => void tauriSystem.openUrl(error.upgrade_url!)}
        >
          {t("providerError.quotaExhausted.upgrade")}
        </Button>
      )}
    </ErrorCard>
  );
}

export function ModelUnavailableCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "model_unavailable" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <ErrorCard
      icon={<AlertTriangleIcon className="size-5" />}
      title={t("providerError.modelUnavailable.title")}
      body={t("providerError.modelUnavailable.body", { provider, model: error.model })}
    />
  );
}
