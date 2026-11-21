import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { Copy, ExternalLink, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-report";
import { isProviderLoginSessionLostError } from "../../lib/provider-login-session-lost";
import type { ProviderInfo } from "../../lib/providers";
import { tauriProvider, tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { ProviderDeviceCode } from "./provider-device-code";
import { providerLoginUrlHost } from "./provider-login-url";

const ANTHROPIC_CONSOLE_KEYS_URL =
  "https://console.anthropic.com/settings/keys";

interface Props {
  provider: ProviderInfo | null;
  url: string | null;
  userCode?: string | null;
  instructions?: string | null;
  onClose: () => void;
}

export function ProviderLoginDialog({
  provider,
  url,
  userCode,
  instructions,
  onClose,
}: Props) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);

  useEffect(() => {
    if (provider && url) {
      setCode("");
      setError(null);
      setSubmitting(false);
      setShowUrl(false);
    }
  }, [provider, url]);

  if (!provider || !url) return null;

  const host = providerLoginUrlHost(url);

  const isAuthCode = !!instructions;

  const referenceUrl =
    isAuthCode && provider.id === "anthropic"
      ? ANTHROPIC_CONSOLE_KEYS_URL
      : url;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      addToast({ title: t("providerLogin.urlCopied"), variant: "success" });
    } catch (err) {
      addToast({
        title: t("providerLogin.urlCopyFailed"),
        description: genericErrorDescription("provider_login_copy_url", err),
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
    } catch (err) {
      setError(
        isProviderLoginSessionLostError(err)
          ? t("providerLogin.sessionExpired", { name: provider.name })
          : genericErrorDescription("provider_login_submit_code", err),
      );
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
            {t("providerLogin.title", { name: provider.name })}
          </DialogTitle>
          <DialogDescription>
            {isAuthCode
              ? t("providerLogin.authCodeDescription", { name: provider.name })
              : userCode
                ? t("providerLogin.deviceDescription", { name: provider.name })
                : t("providerLogin.description", { name: provider.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isAuthCode ? (
            <>
              <p className="rounded-md border bg-chip-subtle/40 p-3 text-[13px] whitespace-pre-line">
                {t("providerLogin.pasteInstructions")}
              </p>
              {host && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto gap-1.5 p-0 text-ink-muted"
                  onClick={() => void tauriSystem.openUrl(referenceUrl)}
                >
                  <ExternalLink className="size-3.5" />
                  {t("providerLogin.reference")}
                </Button>
              )}
            </>
          ) : (
            <>
              {host && (
                <p className="text-[13px] text-ink-muted">
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
                  {showUrl
                    ? t("providerLogin.hideUrl")
                    : t("providerLogin.showUrl")}
                </Button>
              </div>

              {showUrl && (
                <div
                  id="provider-login-url"
                  className="max-h-24 select-all overflow-y-auto rounded-md border bg-chip-subtle/40 p-3 text-[12px] break-all font-mono"
                >
                  {url}
                </div>
              )}
            </>
          )}

          {userCode ? (
            <ProviderDeviceCode
              code={userCode}
              providerName={provider.name}
              verificationUri={url}
              settingsUrl={
                provider.id === "openai"
                  ? "https://chatgpt.com/#settings/Security"
                  : null
              }
              onClose={onClose}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="provider-login-code"
                  className="text-[13px] font-medium"
                >
                  {isAuthCode
                    ? t("providerLogin.tokenLabel")
                    : t("providerLogin.codeLabel")}
                </label>
                <input
                  id="provider-login-code"
                  type="text"
                  autoComplete="off"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={
                    isAuthCode
                      ? t("providerLogin.tokenPlaceholder")
                      : t("providerLogin.codePlaceholder")
                  }
                  className="w-full rounded-md border bg-input px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-focus"
                  disabled={submitting}
                />
              </div>

              {error && (
                <p className="text-[12px] text-danger" role="alert">
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
