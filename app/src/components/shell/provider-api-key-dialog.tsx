import { Button, FormDialog } from "@houston-ai/core";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import {
  apiKeyConnectReason,
  isApiKeyUserRejection,
} from "../../lib/api-key-connect-error";
import { apiKeyReasonCopyKey } from "../../lib/api-key-reason-copy";
import { stayOpen } from "../../lib/dialog-stay-open";
import { isOrgAdminRequiredError } from "../../lib/org-admin-required-error";
import { API_KEY_ENDPOINT_PROVIDERS } from "../../lib/provider-overrides";
import type { ProviderInfo } from "../../lib/providers";
import { tauriProvider, tauriSystem } from "../../lib/tauri";
import { ProviderApiKeyField } from "./provider-api-key-field";
import { ProviderApiKeyGuide } from "./provider-api-key-guide";

function verifyFailureDetail(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/\s*\(engine error \d+\)\s*$/, "");
}

interface Props {
  provider: ProviderInfo | null;
  onClose: () => void;
  onConnected?: () => void;
}

export function ProviderApiKeyDialog({
  provider,
  onClose,
  onConnected,
}: Props) {
  const { t } = useTranslation("providers");
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (provider) {
      setKey("");
      setEndpoint("");
      setError(null);
    }
  }, [provider]);

  if (!provider) return null;
  const url = provider.apiKeyUrl;
  const needsEndpoint = API_KEY_ENDPOINT_PROVIDERS.has(provider.id);

  const handleSubmit = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError(t("apiKey.required"));
      return stayOpen();
    }
    const trimmedEndpoint = endpoint.trim();
    if (needsEndpoint && !trimmedEndpoint.startsWith("https://")) {
      setError(t("apiKey.endpointRequired"));
      return stayOpen();
    }
    setError(null);
    try {
      await tauriProvider.setApiKey(
        provider.id,
        trimmed,
        needsEndpoint ? trimmedEndpoint : undefined,
      );
      onConnected?.();
    } catch (err) {
      const reason = apiKeyConnectReason(err);
      if (isOrgAdminRequiredError(err)) {
        setError(t("apiKey.errorOrgAdminRequired"));
      } else if (reason) {
        if (isApiKeyUserRejection(err)) {
          analytics.track("provider_key_rejected", {
            provider: provider.id,
            error_kind: reason,
          });
        }
        setError(
          t(apiKeyReasonCopyKey(provider.id, reason), { name: provider.name }),
        );
      } else {
        const detail = verifyFailureDetail(err);
        console.error(`[provider_api_key_submit] ${detail}`);
        setError(t("apiKey.verifyFailed", { detail }));
      }
      return stayOpen();
    }
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("apiKey.title", { name: provider.name })}
      description={t("apiKey.description", { name: provider.name })}
      primary={{
        label: t("apiKey.save"),
        pendingLabel: t("apiKey.saving"),
        onClick: handleSubmit,
        disabled: !key.trim() || (needsEndpoint && !endpoint.trim()),
      }}
      labels={{ cancel: t("apiKey.cancel") }}
    >
      {url && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 self-start"
          onClick={() => void tauriSystem.openUrl(url)}
        >
          <ExternalLink className="size-3.5" />
          {t("apiKey.getKey")}
        </Button>
      )}

      <ProviderApiKeyGuide providerId={provider.id} />

      {needsEndpoint && (
        <div className="space-y-1.5">
          <label htmlFor="provider-endpoint" className="text-sm font-medium">
            {t("apiKey.endpointLabel")}
          </label>
          <input
            id="provider-endpoint"
            type="url"
            autoComplete="off"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder={t("apiKey.endpointPlaceholder")}
            className="w-full rounded-md border bg-input px-3 py-2 text-base font-mono focus:outline-none focus:ring-2 focus:ring-focus"
          />
          <p className="text-xs text-ink-muted">{t("apiKey.endpointHelp")}</p>
        </div>
      )}

      <ProviderApiKeyField
        label={t("apiKey.label")}
        placeholder={t("apiKey.placeholder")}
        showLabel={t("apiKey.show")}
        hideLabel={t("apiKey.hide")}
        value={key}
        onChange={setKey}
      />

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </FormDialog>
  );
}
