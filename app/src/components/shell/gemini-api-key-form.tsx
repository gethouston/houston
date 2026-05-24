import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { Button, Spinner } from "@houston-ai/core";
import { tauriProvider, tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { analytics } from "../../lib/analytics";

/**
 * "Advanced" path inside the Gemini connect dialog: paste an API key.
 * Writes through `tauriProvider.setGeminiApiKey` which atomically
 * persists `GEMINI_API_KEY=...` to `~/.gemini/.env` so the bundled
 * gemini CLI picks it up on the next spawn.
 *
 * Kept separate from the OAuth flow so the dialog stays a thin
 * stage-router and so this paste form can be reused (e.g. settings
 * pane) without dragging the OAuth state machine along.
 */
export function GeminiApiKeyForm(props: {
  providerName: string;
  providerId: string;
  apiKeyConsoleUrl: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);

  const [apiKey, setApiKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = apiKey.trim();
  const canSave = trimmed.length >= 10 && !saving;

  const handleOpenConsole = async () => {
    if (!props.apiKeyConsoleUrl) return;
    try {
      await tauriSystem.openUrl(props.apiKeyConsoleUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        title: t("geminiConnect.openConsoleFailed", {
          name: props.providerName,
        }),
        description: msg,
        variant: "error",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      await tauriProvider.setGeminiApiKey(trimmed);
      analytics.track("provider_configured", { provider: props.providerId });
      props.onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addToast({
        title: t("geminiConnect.saveFailed", { name: props.providerName }),
        description: msg,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpenConsole}
        className="self-start gap-1.5"
      >
        <ExternalLink className="size-3.5" />
        {t("geminiConnect.openConsole", { name: props.providerName })}
      </Button>
      <div className="flex items-center gap-2">
        <input
          type={revealed ? "text" : "password"}
          value={apiKey}
          onChange={(ev) => setApiKey(ev.target.value)}
          placeholder={t("geminiConnect.placeholder")}
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
          aria-label={
            revealed ? t("geminiConnect.hide") : t("geminiConnect.show")
          }
          disabled={saving}
        >
          {revealed ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </Button>
      </div>
      {error && (
        <p className="text-[12px] text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={!canSave}
        className="gap-1.5 w-full"
        size="sm"
      >
        {saving && <Spinner className="size-3.5" />}
        {saving ? t("geminiConnect.saving") : t("geminiConnect.saveKey")}
      </Button>
    </form>
  );
}
