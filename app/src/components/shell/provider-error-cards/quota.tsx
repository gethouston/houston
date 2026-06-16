/**
 * Quota / model-availability variants — these are the "pay or switch"
 * outcomes. QuotaExhausted mounts an Upgrade CTA (via `tauriSystem.openUrl`)
 * that drops the user into the right provider console; ModelUnavailable is
 * informational. Both render on the unified `RowCard` (HOU-467).
 */

import { useTranslation } from "react-i18next";
import { AlertTriangleIcon, XCircleIcon } from "lucide-react";
import type { ProviderError } from "@houston-ai/chat";
import { tauriSystem } from "../../../lib/tauri";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
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
        description={t("providerError.quotaExhausted.body", { provider })}
        action={
          error.upgrade_url && (
            <RowCardButton
              label={t("providerError.quotaExhausted.upgrade")}
              onClick={() => tauriSystem.openUrl(error.upgrade_url!)}
            />
          )
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
