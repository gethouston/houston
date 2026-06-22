import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderInfo } from "../../lib/providers";
import { tauriProvider, tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";

/**
 * Connect dialog for API-key providers (OpenRouter, Google Gemini). Unlike the
 * OAuth providers, these have no sign-in flow — the user pastes a key. To keep
 * that easy for a non-technical user, a "Get a key" button opens the provider's
 * key page in their browser so they can mint one in a click.
 *
 * Self-contained: it stores the key (which also makes the provider active and,
 * on the cloud / desktop-host path, captures it for the workspace), toasts, and
 * calls `onConnected` so the parent refreshes provider status. A bad key throws
 * and is shown inline rather than swallowed.
 */
interface Props {
  provider: ProviderInfo | null;
  onClose: () => void;
  /** Called after the key is stored so the parent can refresh provider status. */
  onConnected: (provider: ProviderInfo) => void;
}

export function ProviderApiKeyCard({ provider, onClose, onConnected }: Props) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const [key, setKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset per-open state so a key (or error) from a prior attempt never leaks
  // into the next provider's dialog.
  useEffect(() => {
    if (provider) {
      setKey("");
      setReveal(false);
      setSubmitting(false);
      setError(null);
    }
  }, [provider]);

  if (!provider) return null;
  // Narrow once so the "Get a key" button doesn't need a non-null assertion.
  const createKeyUrl = provider.createKeyUrl;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError(t("apiKey.required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await tauriProvider.setApiKey(provider.id, trimmed);
      addToast({
        title: t("apiKey.saved", { provider: provider.name }),
        variant: "success",
      });
      onConnected(provider);
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
          <DialogTitle>
            {t("apiKey.title", { name: provider.name })}
          </DialogTitle>
          <DialogDescription>{t("apiKey.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {createKeyUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void tauriSystem.openUrl(createKeyUrl)}
            >
              <ExternalLink className="size-3.5" />
              {t("apiKey.getKey", { name: provider.name })}
            </Button>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="provider-api-key"
              className="text-[13px] font-medium"
            >
              {t("apiKey.label")}
            </label>
            <div className="relative">
              <input
                id="provider-api-key"
                type={reveal ? "text" : "password"}
                autoComplete="off"
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t("apiKey.placeholder")}
                className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={reveal ? t("apiKey.hide") : t("apiKey.show")}
              >
                {reveal ? (
                  <EyeOff className="size-3.5" />
                ) : (
                  <Eye className="size-3.5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("apiKey.cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !key.trim()}>
              {submitting ? t("apiKey.submitting") : t("apiKey.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
