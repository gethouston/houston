import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-toast";
import type { ProviderInfo } from "../../lib/providers";
import { tauriSystem } from "../../lib/tauri";

/**
 * Desktop Claude BROWSER login dialog: the native `claude auth login` already
 * opened the browser, so the primary state is a spinner ("approve in your
 * browser") with a "didn't open" fallback link. The approval page normally
 * hands its authorization code back to the CLI automatically; when it can't
 * (firewalls, strict browsers — common on Windows) it shows the user a code
 * instead, so the dialog always offers a visible paste field that relays the
 * code to the CLI's stdin via `onSubmitCode`. The dialog stays open after a
 * submit — completion (or failure) arrives via `claude-login://done`, which
 * unmounts it from the parent. Closing cancels the sign-in.
 */
interface Props {
  provider: ProviderInfo;
  url: string;
  onSubmitCode: (code: string) => Promise<void>;
  onClose: () => void;
}

export function ProviderLoginBrowserPending({
  provider,
  url,
  onSubmitCode,
  onClose,
}: Props) {
  const { t } = useTranslation("providers");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmitCode(trimmed);
      // Keep the dialog open: the CLI now finishes its own exchange and the
      // parent closes on `claude-login://done`.
    } catch (err) {
      setError(genericErrorDescription("provider_login_submit_code", err));
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
            {t("providerLogin.title", { name: provider.name })}
          </DialogTitle>
          <DialogDescription>
            {t("providerLogin.browserDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2 text-[13px] text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span>
            {submitting
              ? t("providerLogin.submitting")
              : t("providerLogin.deviceWaiting")}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <label
            htmlFor="provider-login-browser-code"
            className="block text-[13px] text-ink-muted"
          >
            {t("providerLogin.browserCodeHint")}
          </label>
          <div className="flex gap-2">
            <input
              id="provider-login-browser-code"
              type="text"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("providerLogin.codePlaceholder")}
              className="w-full rounded-md border bg-input px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-focus"
              disabled={submitting}
            />
            <Button type="submit" disabled={submitting || !code.trim()}>
              {t("providerLogin.submit")}
            </Button>
          </div>
          {error && (
            <p className="text-[12px] text-danger" role="alert">
              {error}
            </p>
          )}
        </form>

        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto gap-1.5 p-0 text-ink-muted"
            onClick={() => void tauriSystem.openUrl(url)}
          >
            <ExternalLink className="size-3.5" />
            {t("providerLogin.browserOpen")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("providerLogin.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
