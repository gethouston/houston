import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@houston-ai/core";
import type { ProviderInfo } from "../../lib/providers";
import { tauriProvider, tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { analytics } from "../../lib/analytics";

/**
 * Connect dialog for API-key-only providers (OpenRouter, …) — the ones with
 * `loginKind: "apiKey"` and no CLI/OAuth sign-in. The user pastes a key; it's
 * persisted by the engine (`tauriProvider.setProviderApiKey`) to that
 * provider's credential store and injected into the CLI subprocess at spawn.
 *
 * Provider-driven (copy, console URL, env-var hint all come from
 * `ProviderInfo`), so a new API-key provider needs no new dialog — just a
 * `PROVIDERS` entry. Gemini keeps its own dialog because it leads with OAuth.
 */
export function ApiKeyConnectDialog(props: {
  provider: ProviderInfo | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (providerId: string) => void;
}) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);

  const [apiKey, setApiKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = props.provider;
  const open = provider !== null;
  const trimmed = apiKey.trim();
  const canSave = trimmed.length >= 10 && !saving;

  const reset = () => {
    setApiKey("");
    setRevealed(false);
    setError(null);
    setSaving(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    props.onOpenChange(next);
  };

  const handleOpenConsole = async () => {
    if (!provider?.apiKeyConsoleUrl) return;
    try {
      await tauriSystem.openUrl(provider.apiKeyConsoleUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        title: t("apiKeyConnect.openConsoleFailed", { name: provider.name }),
        description: msg,
        variant: "error",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider || !canSave) return;
    setError(null);
    setSaving(true);
    try {
      await tauriProvider.setProviderApiKey(provider.id, trimmed);
      analytics.track("provider_configured", { provider: provider.id });
      const id = provider.id;
      reset();
      props.onSaved(id);
      props.onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addToast({
        title: t("apiKeyConnect.saveFailed", { name: provider.name }),
        description: msg,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("apiKeyConnect.title", { name: provider?.name ?? "" })}</DialogTitle>
          <DialogDescription>
            {t("apiKeyConnect.description", { name: provider?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          {provider?.apiKeyConsoleUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenConsole}
              className="self-start gap-1.5"
            >
              <ExternalLink className="size-3.5" />
              {t("apiKeyConnect.openConsole", { name: provider.name })}
            </Button>
          )}
          <div className="flex items-center gap-2">
            <input
              type={revealed ? "text" : "password"}
              value={apiKey}
              onChange={(ev) => setApiKey(ev.target.value)}
              placeholder={t("apiKeyConnect.placeholder")}
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={saving}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRevealed((v) => !v)}
              className="gap-1.5 shrink-0"
              aria-label={revealed ? t("apiKeyConnect.hide") : t("apiKeyConnect.show")}
              disabled={saving}
            >
              {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
          </div>
          {provider?.apiKeyEnvVar && (
            <p className="text-[11px] text-muted-foreground">
              {t("apiKeyConnect.envHint", { envVar: provider.apiKeyEnvVar })}
            </p>
          )}
          {error && (
            <p className="text-[12px] text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!canSave} className="gap-1.5 w-full" size="sm">
            {saving && <Spinner className="size-3.5" />}
            {saving ? t("apiKeyConnect.saving") : t("apiKeyConnect.saveKey")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
