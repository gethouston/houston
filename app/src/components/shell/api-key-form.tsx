import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { Button, Spinner } from "@houston-ai/core";
import {
  MIN_PROVIDER_API_KEY_LENGTH,
  saveProviderApiKey,
  type ProviderCredentialSaveTarget,
} from "../../lib/provider-api-key";
import { tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { analytics } from "../../lib/analytics";

export function ApiKeyForm(props: {
  providerName: string;
  providerId: string;
  apiKeyConsoleUrl: string;
  /** When false, shows the form but save stays disabled until backend lands. */
  saveEnabled?: boolean;
  /** Where to persist the key. Default `local` (Settings). Cloud reconnect uses `activeAgent`. */
  credentialTarget?: ProviderCredentialSaveTarget;
  /** Extra fields rendered after the key input, still inside the form. */
  middleContent?: ReactNode;
  /** Runs before the API key is persisted (e.g. save companion preferences). */
  beforeSaved?: () => Promise<void>;
  /** Runs after the key is stored (e.g. probe the provider API). */
  afterKeySaved?: () => Promise<void>;
  /** Override primary submit label (default: saveKey). */
  saveLabel?: string;
  /** Override label while submitting (default: saving). */
  savingLabel?: string;
  /** When set, formats save failures instead of the default apiKeyConnect.saveFailed toast. */
  formatSaveError?: (err: unknown) => { title: string; description?: string } | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const saveEnabled = props.saveEnabled ?? true;

  const [apiKey, setApiKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = apiKey.trim();
  const canSave = saveEnabled && trimmed.length >= MIN_PROVIDER_API_KEY_LENGTH && !saving;

  const handleOpenConsole = async () => {
    if (!props.apiKeyConsoleUrl) return;
    try {
      await tauriSystem.openUrl(props.apiKeyConsoleUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        title: t("apiKeyConnect.openConsoleFailed", { name: props.providerName }),
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
      if (props.beforeSaved) {
        await props.beforeSaved();
      }
      await saveProviderApiKey(props.providerId, trimmed, props.credentialTarget ?? "local");
      if (props.afterKeySaved) {
        await props.afterKeySaved();
      }
      analytics.track("provider_configured", { provider: props.providerId });
      props.onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      const custom = props.formatSaveError?.(err);
      addToast({
        title: custom?.title ?? t("apiKeyConnect.saveFailed", { name: props.providerName }),
        description: custom?.description ?? msg,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="min-w-0 space-y-3 pt-1">
      {props.apiKeyConsoleUrl ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenConsole}
          className="max-w-full gap-1.5 self-start"
          title={props.apiKeyConsoleUrl}
        >
          <ExternalLink className="size-3.5 shrink-0" />
          <span className="truncate">{t("apiKeyConnect.openConsole", { name: props.providerName })}</span>
        </Button>
      ) : null}
      <div className="flex min-w-0 items-center gap-2">
        <input
          type={revealed ? "text" : "password"}
          value={apiKey}
          onChange={(ev) => setApiKey(ev.target.value)}
          placeholder={t("apiKeyConnect.placeholder")}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
          className="shrink-0 gap-1.5"
          aria-label={revealed ? t("apiKeyConnect.hide") : t("apiKeyConnect.show")}
          disabled={saving}
        >
          {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>
      </div>
      {props.middleContent}
      {!saveEnabled ? (
        <p className="text-[12px] text-muted-foreground">{t("apiKeyConnect.saveUnavailable")}</p>
      ) : null}
      {error ? (
        <p className="text-[12px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!canSave} className="w-full gap-1.5" size="sm">
        {saving && <Spinner className="size-3.5" />}
        {saving
          ? (props.savingLabel ?? t("apiKeyConnect.saving"))
          : (props.saveLabel ?? t("apiKeyConnect.saveKey"))}
      </Button>
    </form>
  );
}
