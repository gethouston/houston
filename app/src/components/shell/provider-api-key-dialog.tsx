import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ApiKeyConnectReason,
  apiKeyConnectReason,
} from "../../lib/api-key-connect-error";
import { API_KEY_ENDPOINT_PROVIDERS } from "../../lib/provider-overrides";
import type { ProviderInfo } from "../../lib/providers";
import { tauriProvider, tauriSystem } from "../../lib/tauri";
import { ProviderApiKeyField } from "./provider-api-key-field";
import { ProviderApiKeyGuide } from "./provider-api-key-guide";

/**
 * The host's own reason for a rejected connect ("openrouter rejected this API
 * key…", "could not verify…"), minus the transport's "(engine error NNN)"
 * suffix — the sentence is authored for the user; the code is not.
 */
function verifyFailureDetail(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/\s*\(engine error \d+\)\s*$/, "");
}

/**
 * Connect dialog for API-key providers. Unlike the OAuth
 * providers, these have no browser sign-in: the user pastes a key. A prominent
 * "Get your API key" button opens the provider's dashboard (`apiKeyUrl`) so a
 * non-technical user can create or copy a key in one click, then paste it here.
 *
 * On success the new engine stores the key for the workspace and the adapter
 * fires `ProviderLoginComplete`, which the parent (settings / picker) already
 * handles: the card flips to connected and a success toast shows. A failure is
 * surfaced inline (never swallowed).
 */
interface Props {
  provider: ProviderInfo | null;
  onClose: () => void;
}

/** Verification verdicts (from the engine's typed `reason`) → inline copy. */
const REASON_COPY: Record<
  ApiKeyConnectReason,
  | "apiKey.errorInvalidKey"
  | "apiKey.errorKeyRestricted"
  | "apiKey.errorProviderUnavailable"
> = {
  invalid_key: "apiKey.errorInvalidKey",
  key_restricted: "apiKey.errorKeyRestricted",
  provider_unavailable: "apiKey.errorProviderUnavailable",
};

/**
 * NVIDIA's `key_restricted` is an ACCOUNT gate, not key settings: NVIDIA has
 * to enable "Public API Endpoints" on the account's org, so the generic
 * "create a new key" remedy would send users in circles (HOU-890).
 */
function reasonCopyKey(providerId: string, reason: ApiKeyConnectReason) {
  if (providerId === "nvidia" && reason === "key_restricted")
    return "apiKey.errorNvidiaAccountGated" as const;
  // Bedrock's console lists keys by NAME ("BedrockAPIKey-xxxx-at-<account>")
  // and reveals the VALUE only once at generation, so a rejected key is
  // usually the name pasted in place of the value (PRODUCT-1477) — say so
  // instead of the generic "check it and paste it again".
  if (providerId === "amazon-bedrock" && reason === "invalid_key")
    return "apiKey.errorBedrockInvalidKey" as const;
  return REASON_COPY[reason];
}

export function ProviderApiKeyDialog({ provider, onClose }: Props) {
  const { t } = useTranslation("providers");
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset per-open state so a stale key or error never leaks across opens. The
  // REVEAL toggle is not reset here and does not need to be: it lives inside
  // `ProviderApiKeyField`, which unmounts with the dialog and so comes back
  // hidden on its own.
  useEffect(() => {
    if (provider) {
      setKey("");
      setEndpoint("");
      setError(null);
      setSubmitting(false);
    }
  }, [provider]);

  if (!provider) return null;
  const url = provider.apiKeyUrl;
  // Azure OpenAI (PRODUCT-1477): every request goes to the user's own resource
  // URL, so the dialog collects the endpoint alongside the key.
  const needsEndpoint = API_KEY_ENDPOINT_PROVIDERS.has(provider.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError(t("apiKey.required"));
      return;
    }
    const trimmedEndpoint = endpoint.trim();
    if (needsEndpoint && !trimmedEndpoint.startsWith("https://")) {
      setError(t("apiKey.endpointRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await tauriProvider.setApiKey(
        provider.id,
        trimmed,
        needsEndpoint ? trimmedEndpoint : undefined,
      );
      // Success: the parent's ProviderLoginComplete handler flips the card and
      // toasts. Close here so the dialog doesn't linger over the connected state.
      onClose();
    } catch (err) {
      // The engine sends a typed verdict with the failure (bad key, key
      // blocked by its own settings, provider unreachable) — show the matching
      // actionable copy. A reason-less failure (transport error, older host)
      // shows the host's REAL sentence instead of generic copy, which turned
      // every provider-QA failure into an undiagnosable "failed to connect".
      // Sentry capture already happened in the tauri call wrapper.
      const reason = apiKeyConnectReason(err);
      if (reason) {
        setError(
          t(reasonCopyKey(provider.id, reason), { name: provider.name }),
        );
      } else {
        const detail = verifyFailureDetail(err);
        console.error(`[provider_api_key_submit] ${detail}`);
        setError(t("apiKey.verifyFailed", { detail }));
      }
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("apiKey.title", { name: provider.name })}
          </DialogTitle>
          <DialogDescription>
            {t("apiKey.description", { name: provider.name })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {url && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void tauriSystem.openUrl(url)}
            >
              <ExternalLink className="size-3.5" />
              {t("apiKey.getKey")}
            </Button>
          )}

          <ProviderApiKeyGuide providerId={provider.id} />

          {needsEndpoint && (
            <div className="space-y-1.5">
              <label
                htmlFor="provider-endpoint"
                className="text-[13px] font-medium"
              >
                {t("apiKey.endpointLabel")}
              </label>
              <input
                id="provider-endpoint"
                type="url"
                autoComplete="off"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={t("apiKey.endpointPlaceholder")}
                className="w-full rounded-md border bg-input px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-focus"
                disabled={submitting}
              />
              <p className="text-[12px] text-ink-muted">
                {t("apiKey.endpointHelp")}
              </p>
            </div>
          )}

          <ProviderApiKeyField
            label={t("apiKey.label")}
            placeholder={t("apiKey.placeholder")}
            showLabel={t("apiKey.show")}
            hideLabel={t("apiKey.hide")}
            value={key}
            disabled={submitting}
            onChange={setKey}
          />

          {error && (
            <p className="text-[12px] text-danger" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("apiKey.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                submitting || !key.trim() || (needsEndpoint && !endpoint.trim())
              }
            >
              {submitting ? t("apiKey.saving") : t("apiKey.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
