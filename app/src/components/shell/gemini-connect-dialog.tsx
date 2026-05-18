import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type { ProviderInfo } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { GeminiApiKeyForm } from "./gemini-api-key-form";

/**
 * Connect dialog for Gemini.
 *
 * Houston's positioning per project memory is "use your existing CLI
 * subscription / account" — Claude Code uses Claude.ai login, Codex
 * uses ChatGPT login, Gemini uses your personal Google account via
 * gemini-cli's own OAuth. So "Sign in with Google" is the PRIMARY
 * affordance; API-key paste is demoted behind an "advanced" disclosure.
 *
 * Two paths, both close the dialog and let the picker's polling pick
 * up the new auth state:
 *
 *   1. Primary: OAuth — calls `tauriProvider.launchLogin("gemini")`,
 *      which on the engine side spawns `gemini --acp` and sends the
 *      ACP `authenticate` JSON-RPC method. gemini-cli opens the user's
 *      browser with its own Google app identity (consent screen reads
 *      "Gemini CLI", which is accurate — the user IS authenticating
 *      gemini-cli on their machine), runs Google's standard PKCE flow,
 *      and writes `~/.gemini/oauth_creds.json` itself. Houston never
 *      touches Google's OAuth servers directly and never embeds OAuth
 *      client credentials. Same model as `claude auth login --claudeai`
 *      and `codex login`.
 *   2. Advanced: API key — `GeminiApiKeyForm` writes
 *      `~/.gemini/.env::GEMINI_API_KEY` via the engine. For users on
 *      paid pay-as-you-go from aistudio.google.com.
 *
 * Wire details:
 * - `engine/houston-engine-core/src/provider/gemini_login.rs` (ACP launcher)
 * - `engine/houston-engine-core/src/provider/gemini_credentials.rs` (API-key write)
 */

interface Props {
  provider: ProviderInfo | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (providerId: string) => void;
  /**
   * Called when the user kicks off OAuth. The picker uses this to
   * start polling `checkStatus("gemini")` — when the probe flips to
   * Authenticated (gemini-cli finished the browser flow and wrote
   * its credential files), the card flips to Connected.
   */
  onLoginStarted: (providerId: string) => void;
}

export function GeminiConnectDialog({
  provider,
  onOpenChange,
  onSaved,
  onLoginStarted,
}: Props) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const [apiKeyExpanded, setApiKeyExpanded] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time a new provider opens the dialog so leftover
  // UI doesn't bleed across sessions.
  useEffect(() => {
    if (provider) {
      setApiKeyExpanded(false);
      setSigningIn(false);
      setError(null);
    }
  }, [provider]);

  if (!provider || provider.loginKind !== "apiKey") return null;

  const handleSignInWithGoogle = async () => {
    setError(null);
    setSigningIn(true);
    try {
      // Engine spawns `gemini --acp`, sends ACP `authenticate` for the
      // `oauth-personal` method, gemini-cli opens the user's browser.
      // The call returns once gemini-cli has acknowledged the request
      // (it's then waiting on the browser flow externally).
      await tauriProvider.launchLogin(provider.id);
      // Hand off to the picker's polling loop — it watches
      // `checkStatus("gemini")` every 1.5-2s and flips to Connected
      // when gemini-cli writes its credential files. Close the dialog
      // so the user sees the picker's pending state directly.
      onLoginStarted(provider.id);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addToast({
        title: t("geminiConnect.signInFailed", { name: provider.name }),
        description: msg,
        variant: "error",
      });
      setSigningIn(false);
    }
  };

  return (
    <Dialog
      open={provider !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("geminiConnect.title", { name: provider.name })}
          </DialogTitle>
          <DialogDescription>
            {t("geminiConnect.description", { name: provider.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            type="button"
            size="lg"
            className="w-full justify-center gap-2"
            onClick={handleSignInWithGoogle}
            disabled={signingIn}
          >
            {signingIn
              ? t("geminiConnect.signingIn")
              : t("geminiConnect.signInWithGoogle")}
          </Button>
          <p className="text-[12px] text-muted-foreground text-center">
            {t("geminiConnect.signInRecommended")}
          </p>
          {error && (
            <p className="text-[12px] text-destructive text-center" role="alert">
              {error}
            </p>
          )}

          <Separator label={t("geminiConnect.or")} />

          <button
            type="button"
            onClick={() => setApiKeyExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
            aria-expanded={apiKeyExpanded}
          >
            {apiKeyExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {t("geminiConnect.useApiKeyAdvanced")}
          </button>

          {apiKeyExpanded && (
            <GeminiApiKeyForm
              providerName={provider.name}
              providerId={provider.id}
              apiKeyConsoleUrl={provider.apiKeyConsoleUrl ?? ""}
              onSaved={() => {
                onSaved(provider.id);
                onOpenChange(false);
              }}
            />
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("geminiConnect.cancel")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Separator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
      <div className="flex-1 h-px bg-border" />
      <span>{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
