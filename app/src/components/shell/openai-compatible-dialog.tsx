import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderInfo } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";
import {
  LabeledTextField,
  SecretField,
} from "./openai-compatible-dialog-parts";

/**
 * Connect dialog for an OpenAI-compatible (local) server — Ollama, LM Studio,
 * vLLM, LiteLLM, etc. Unlike the api-key providers this asks for a base URL and
 * the model id the server serves; the key is optional (local servers usually
 * ignore it). Gated by the host's `openaiCompatible` capability, so the runtime
 * is co-located with a host that can reach the endpoint (see
 * `getVisibleProviders`).
 *
 * On success the engine stores the endpoint, makes it the active provider, and
 * the adapter fires `ProviderLoginComplete` — the same signal the OAuth and
 * api-key paths emit, so the parent flips the card to connected and toasts. A
 * failure is shown inline (never swallowed).
 */
interface Props {
  provider: ProviderInfo | null;
  onClose: () => void;
  /**
   * Called with the connected model id on success (before `onClose`). The picker
   * uses it to select the real model — the static catalog has none for a local
   * server, so without this the setup flow would receive an empty model id.
   */
  onConnected?: (model: string) => void;
}

export function OpenAiCompatibleDialog({
  provider,
  onClose,
  onConnected,
}: Props) {
  const { t } = useTranslation("providers");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset per-open state so a stale value never leaks across opens.
  useEffect(() => {
    if (provider) {
      setBaseUrl("");
      setModel("");
      setName("");
      setKey("");
      setShowKey(false);
      setError(null);
      setSubmitting(false);
    }
  }, [provider]);

  if (!provider) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = baseUrl.trim();
    const trimmedModel = model.trim();
    if (!trimmedUrl) {
      setError(t("openaiCompatible.baseUrlRequired"));
      return;
    }
    if (!trimmedModel) {
      setError(t("openaiCompatible.modelRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await tauriProvider.setCustomEndpoint({
        baseUrl: trimmedUrl,
        model: trimmedModel,
        name: name.trim() || undefined,
        apiKey: key.trim() || undefined,
      });
      // Success: the parent's ProviderLoginComplete handler flips the card.
      onConnected?.(trimmedModel);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("openaiCompatible.title")}</DialogTitle>
          <DialogDescription>
            {t("openaiCompatible.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <LabeledTextField
            id="oac-base-url"
            label={t("openaiCompatible.baseUrlLabel")}
            help={t("openaiCompatible.baseUrlHelp")}
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder={t("openaiCompatible.baseUrlPlaceholder")}
            disabled={submitting}
            mono
            inputMode="url"
          />

          <LabeledTextField
            id="oac-model"
            label={t("openaiCompatible.modelLabel")}
            help={t("openaiCompatible.modelHelp")}
            value={model}
            onChange={setModel}
            placeholder={t("openaiCompatible.modelPlaceholder")}
            disabled={submitting}
            mono
          />

          <LabeledTextField
            id="oac-name"
            label={t("openaiCompatible.nameLabel")}
            help={t("openaiCompatible.nameHelp")}
            value={name}
            onChange={setName}
            placeholder={t("openaiCompatible.namePlaceholder")}
            disabled={submitting}
          />

          <SecretField
            id="oac-key"
            label={t("openaiCompatible.keyLabel")}
            help={t("openaiCompatible.keyHelp")}
            value={key}
            onChange={setKey}
            placeholder={t("openaiCompatible.keyPlaceholder")}
            disabled={submitting}
            show={showKey}
            onToggleShow={() => setShowKey((v) => !v)}
            showLabel={t("openaiCompatible.show")}
            hideLabel={t("openaiCompatible.hide")}
          />

          {error && (
            <p className="text-[12px] text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("openaiCompatible.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting || !baseUrl.trim() || !model.trim()}
            >
              {submitting
                ? t("openaiCompatible.saving")
                : t("openaiCompatible.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
