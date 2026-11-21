import type { ProviderError } from "@houston-ai/chat";
import { AlertTriangleIcon, XCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { credentialScopeOf } from "../../../lib/credential-scope";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
import { providerErrorModelLabel, providerLabel } from "./shared";

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
  const body = error.resets_at
    ? t("providerError.quotaExhausted.bodyWithReset", {
        provider,
        time: error.resets_at,
      })
    : t("providerError.quotaExhausted.body", { provider });
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<XCircleIcon className="size-5" />}
        title={t("providerError.quotaExhausted.title")}
        description={body}
        action={
          onSwitchModel ? (
            <RowCardButton
              variant="outline"
              label={t("providerError.quotaExhausted.switchProvider")}
              onClick={onSwitchModel}
            />
          ) : undefined
        }
      />
    </div>
  );
}

export function ContextOverflowCard({
  error,
  onSwitchModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "context_overflow" }>;
}) {
  const { t } = useTranslation("shell");
  const model = error.model
    ? providerErrorModelLabel(error.provider, error.model)
    : providerLabel(error.provider);
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<AlertTriangleIcon className="size-5" />}
        title={t("providerError.contextOverflow.title")}
        description={t("providerError.contextOverflow.body", { model })}
        action={
          onSwitchModel ? (
            <RowCardButton
              variant="outline"
              label={t("providerError.contextOverflow.switchModel")}
              onClick={onSwitchModel}
            />
          ) : undefined
        }
      />
    </div>
  );
}

export function ModelUnavailableCard({
  error,
  onSwitchModel,
  onApplyModel,
}: BaseProps & {
  error: Extract<ProviderError, { kind: "model_unavailable" }>;
  onApplyModel?: (model: string) => void;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  const model = providerErrorModelLabel(error.provider, error.model);
  const fallback = error.suggested_fallback;
  const fallbackLabel = fallback
    ? providerErrorModelLabel(error.provider, fallback)
    : "";
  const personal = credentialScopeOf(error.credential) === "personal";
  const bodyKey =
    error.reason === "not_deployed"
      ? "providerError.modelUnavailable.bodyNotDeployed"
      : personal
        ? "providerError.credential.modelUnavailableBody"
        : "providerError.modelUnavailable.body";
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<AlertTriangleIcon className="size-5" />}
        title={t("providerError.modelUnavailable.title")}
        description={t(bodyKey, { provider, model })}
        action={
          (fallback && onApplyModel) || onSwitchModel ? (
            <>
              {fallback && onApplyModel && (
                <RowCardButton
                  label={t("providerError.modelUnavailable.switchToFallback", {
                    model: fallbackLabel,
                  })}
                  onClick={() => onApplyModel(fallback)}
                />
              )}
              {onSwitchModel && (
                <RowCardButton
                  variant="outline"
                  label={t("providerError.modelUnavailable.pickAnother")}
                  onClick={onSwitchModel}
                />
              )}
            </>
          ) : undefined
        }
      />
    </div>
  );
}
