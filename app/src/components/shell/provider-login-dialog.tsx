import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Copy, Eye, EyeOff } from "lucide-react";
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
import { tauriProvider, tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { providerLoginUrlHost } from "./provider-login-url";
import { ProviderDeviceCode } from "./provider-device-code";

/**
 * Sign-in dialog for remote/headless Houston Engines, where the provider
 * CLI can't open the user's browser (it lives on another machine). The
 * engine surfaces the sign-in URL via a `ProviderLoginUrl` WS event; this
 * dialog shows it plus the per-provider completion step:
 *
 *  - Paste-back (Claude): a text input relays the verification code to
 *    `POST /v1/providers/:name/login/code` (written to the CLI's stdin).
 *  - Device-grant (codex `--device-auth`): when the event carries
 *    `userCode`, we render <ProviderDeviceCode> with that one-time code
 *    for the user to enter on the provider's verification page. The CLI
 *    polls and finishes on its own, so there's no paste-back input; the
 *    dialog waits for `ProviderLoginComplete` (handled by the parent) to
 *    auto-close.
 *
 * On desktop the dialog still pops (claude prints the URL unconditionally)
 * but auto-dismisses once the CLI's own localhost callback completes.
 */
interface Props {
  provider: ProviderInfo | null;
  url: string | null;
  /** Device-grant one-time code (codex). Null/absent = paste-back flow. */
  userCode?: string | null;
  onClose: () => void;
}

export function ProviderLoginDialog({ provider, url, userCode, onClose }: Props) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The raw OAuth URL is long and meaningless to a non-technical user, so
  // it stays hidden by default (issue #297). "Open URL" / "Copy URL" are
  // the happy path; revealing the raw string is the manual fallback for
  // when the clipboard or browser-open didn't work.
  const [showUrl, setShowUrl] = useState(false);

  // Reset per-open state every time a new provider opens the dialog so a
  // stale code from a prior failed attempt — or a revealed URL — doesn't
  // leak across.
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
      setShowUrl(false);
    }
  }, [provider, url]);

  if (!provider || !url) return null;

  // Friendly destination shown in place of the raw URL. Null when the URL
  // isn't parseable; we then just omit the hint.
  const host = providerLoginUrlHost(url);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      addToast({ title: t("providerLogin.urlCopied"), variant: "success" });
    } catch (err) {
      addToast({
        title: t("providerLogin.urlCopyFailed"),
        description: err instanceof Error ? err.message : String(err),
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
      // Do NOT close here: wait for `ProviderLoginComplete` so the user
      // sees the CLI actually finish the exchange. The parent listens for
      // that event and calls `onClose`.
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
          <DialogTitle>{t("providerLogin.title", { name: provider.name })}</DialogTitle>
          <DialogDescription>
            {userCode
              ? t("providerLogin.deviceDescription", { name: provider.name })
              : t("providerLogin.description", { name: provider.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {host && (
            <p className="text-[13px] text-muted-foreground">
              {t("providerLogin.destinationHint", { host })}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void tauriSystem.openUrl(url)}
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              aria-expanded={showUrl}
              aria-controls="provider-login-url"
              onClick={() => setShowUrl((v) => !v)}
            >
              {showUrl ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
              {showUrl ? t("providerLogin.hideUrl") : t("providerLogin.showUrl")}
            </Button>
          </div>

          {showUrl && (
            <div
              id="provider-login-url"
              className="max-h-24 select-all overflow-y-auto rounded-md border bg-muted/40 p-3 text-[12px] break-all font-mono"
            >
              {url}
            </div>
          )}

          {userCode ? (
            <ProviderDeviceCode
              code={userCode}
              providerName={provider.name}
              onClose={onClose}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  {submitting ? t("providerLogin.submitting") : t("providerLogin.submit")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
