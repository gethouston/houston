import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Copy } from "lucide-react";
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

/**
 * OAuth verification-code dialog for remote/headless Houston Engines.
 *
 * When the engine spawns a provider CLI (`claude auth login`, `codex
 * login`) inside a Docker container or on an Always-On VPS, the CLI
 * can't open the user's browser — the browser is on a different
 * machine entirely. The CLI prints a fallback OAuth URL to stdout and
 * waits for a verification code on stdin. The engine surfaces that
 * URL via a `ProviderLoginUrl` WS event; this dialog shows it (and
 * auto-opens it in a new tab) plus a paste-code input. Submitting
 * relays the code through `POST /v1/providers/:name/login/code`,
 * which the engine writes into the CLI's stdin.
 *
 * On desktop Houston this dialog still pops because claude prints the
 * fallback URL unconditionally — but claude finishes via its own
 * `127.0.0.1` callback before the user ever needs to paste, the
 * `ProviderLoginComplete` event arrives, and the dialog auto-closes.
 */
interface Props {
  provider: ProviderInfo | null;
  url: string | null;
  onClose: () => void;
}

export function ProviderLoginDialog({ provider, url, onClose }: Props) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset code state every time a new provider opens the dialog so a
  // stale code from a prior failed attempt doesn't leak across.
  // Deliberately do NOT `window.open` here: claude/codex print the
  // fallback URL unconditionally, including on desktop where the CLI
  // already opened the user's browser via xdg-open/open. Auto-opening
  // a duplicate tab would be a regression for personal-use Houston.
  // The "Open URL" button below is the explicit action for remote
  // deployments where the browser hasn't been opened.
  useEffect(() => {
    if (provider && url) {
      setCode("");
      setError(null);
      setSubmitting(false);
    }
  }, [provider, url]);

  if (!provider || !url) return null;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      addToast({
        title: t("providerLogin.urlCopied"),
        variant: "success",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        title: t("providerLogin.urlCopyFailed"),
        description: msg,
        variant: "error",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError(t("providerLogin.codeRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await tauriProvider.submitLoginCode(provider.id, trimmed);
      // Do NOT close the dialog here — wait for
      // `ProviderLoginComplete` to fire so the user sees confirmation
      // that the CLI actually finished the OAuth exchange. The parent
      // listens for that event and calls `onClose`.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={provider !== null && url !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("providerLogin.title", { name: provider.name })}
          </DialogTitle>
          <DialogDescription>
            {t("providerLogin.description", { name: provider.name })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-[12px] break-all font-mono">
            {url}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="size-3.5" />
              {t("providerLogin.openUrl")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleCopyUrl}
            >
              <Copy className="size-3.5" />
              {t("providerLogin.copyUrl")}
            </Button>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="provider-login-code" className="text-[13px] font-medium">
              {t("providerLogin.codeLabel")}
            </label>
            <input
              id="provider-login-code"
              type="text"
              autoComplete="off"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("providerLogin.codePlaceholder")}
              className="w-full rounded-md border bg-background px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={submitting}
            />
          </div>

          {error && (
            <p className="text-[12px] text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("providerLogin.cancel")}
            </Button>
            <Button type="submit" disabled={submitting || !code.trim()}>
              {submitting
                ? t("providerLogin.submitting")
                : t("providerLogin.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
