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

interface BaseProps {
  onSwitchModel?: () => void;
}

export function QuotaExhaustedCard({
  error,
  onSwitchModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "quota_exhausted" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  const upgradeUrl = error.upgrade_url;
  return (
    <ErrorCard
      icon={<XCircleIcon className="size-5" />}
      title={t("providerError.quotaExhausted.title")}
      body={t("providerError.quotaExhausted.body", { provider })}
    >
      {upgradeUrl && (
        <Button
          size="sm"
          className="h-8 gap-2 rounded-full px-3 text-xs"
          onClick={() => void tauriSystem.openUrl(upgradeUrl)}
        >
          {t("providerError.quotaExhausted.upgrade")}
        </Button>
      )}
      {onSwitchModel && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 rounded-full px-3 text-xs"
          onClick={onSwitchModel}
        >
          {t("providerError.quotaExhausted.switchProvider")}
        </Button>
      )}
    </ErrorCard>
  );
}

export function ModelUnavailableCard({
  error,
  onSwitchModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "model_unavailable" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  return (
    <ErrorCard
      icon={<AlertTriangleIcon className="size-5" />}
      title={t("providerError.modelUnavailable.title")}
      body={t("providerError.modelUnavailable.body", {
        provider,
        model: error.model,
      })}
    >
      {error.suggested_fallback && onSwitchModel && (
        <Button
          size="sm"
          className="h-8 gap-2 rounded-full px-3 text-xs"
          onClick={onSwitchModel}
        >
          {t("providerError.modelUnavailable.switchToFallback", {
            model: error.suggested_fallback,
          })}
        </Button>
      )}
      {onSwitchModel && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 rounded-full px-3 text-xs"
          onClick={onSwitchModel}
        >
          {t("providerError.modelUnavailable.pickAnother")}
        </Button>
      )}
    </ErrorCard>
  );
}
