/**
 * Quota / model-availability variants — the "pay or switch" outcomes. Both are
 * informational: the body tells the user to upgrade or switch provider, and
 * QuotaExhausted names the reset time when the provider gives one. Rendered on
 * the unified `RowCard` (HOU-467).
 */

import { useTranslation } from "react-i18next";
import { AlertTriangleIcon, XCircleIcon } from "lucide-react";
import type { ProviderError } from "@houston-ai/chat";
import { RowCard } from "../../cards/row-card";
import { providerLabel } from "./shared";

export function QuotaExhaustedCard({
  error,
}: {
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
      />
    </div>
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
    <div className="w-full px-1 py-2">
      <RowCard
        media={<AlertTriangleIcon className="size-5" />}
        title={t("providerError.modelUnavailable.title")}
        description={t("providerError.modelUnavailable.body", {
          provider,
          model: error.model,
        })}
      />
    </div>
  );
}
