import { Button, DialogFooter, Spinner } from "@houston-ai/core";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-toast";
import { tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";

/**
 * Device-grant completion panel (codex `--device-auth`): shows the
 * one-time code the user enters on the provider's verification page,
 * plus a waiting indicator and a close button. The CLI polls and
 * completes on its own, so there's no paste-back input — the parent
 * `ProviderLoginDialog` auto-closes on `ProviderLoginComplete`. Rendered
 * only when the engine surfaced a `userCode`. Split out to keep the
 * dialog under the 200-line ceiling.
 *
 * On mount we open the verification page once (`verificationUri`) so a
 * non-technical user lands where the code goes without hunting for a
 * button. Popup blockers can veto an open that isn't tied to a click, so
 * the parent dialog's "Open URL" button stays as the user-driven
 * fallback. `settingsUrl`, when set (OpenAI/ChatGPT), surfaces the
 * "turn on device-code sign-in" hint that catches the most common
 * dead-end: device login switched off in the provider's own settings.
 */
interface Props {
  code: string;
  providerName: string;
  verificationUri: string;
  /** Provider settings page to enable device-code sign-in. OpenAI only. */
  settingsUrl?: string | null;
  onClose: () => void;
}

export function ProviderDeviceCode({
  code,
  providerName,
  verificationUri,
  settingsUrl,
  onClose,
}: Props) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  // Brief inline confirmation: on copy the code box swaps to "Code
  // copied!" for a couple seconds, then reverts. Clearer than a toast for
  // a value the user is about to paste elsewhere — the feedback lands
  // right where they're looking.
  const [copied, setCopied] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Open the verification page exactly once per mounted panel, even if a
  // re-emit swaps the code prop underneath us.
  const openedRef = useRef(false);

  // Drop the confirmation if a fresh code arrives (e.g. a re-emit), and
  // clear any pending timer on unmount so it can't fire into an unmounted
  // component.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `code` is intentionally in deps to reset the copied state whenever a new code prop arrives; the effect body calls only the stable setCopied setter but the trigger is the prop change.
  useEffect(() => {
    setCopied(false);
  }, [code]);
  useEffect(() => {
    return () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  // Auto-open the verification page on first render. A failed open is
  // surfaced (never swallowed) so the user knows to use the dialog's
  // "Open URL" button instead of staring at a code with nowhere to enter it.
  useEffect(() => {
    if (openedRef.current || !verificationUri) return;
    openedRef.current = true;
    tauriSystem.openUrl(verificationUri).catch((err) => {
      addToast({
        title: t("providerLogin.deviceOpenFailed"),
        description: genericErrorDescription("provider_device_open_url", err),
        variant: "error",
      });
    });
  }, [verificationUri, addToast, t]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (revertTimer.current) clearTimeout(revertTimer.current);
      revertTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      addToast({
        title: t("providerLogin.codeCopyFailed"),
        description: genericErrorDescription("provider_device_copy_code", err),
        variant: "error",
      });
    }
  };

  const openSettings = () => {
    if (!settingsUrl) return;
    tauriSystem.openUrl(settingsUrl).catch((err) => {
      addToast({
        title: t("providerLogin.deviceSettingsOpenFailed"),
        description: genericErrorDescription(
          "provider_device_open_settings",
          err,
        ),
        variant: "error",
      });
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <span className="block text-[13px] font-medium">
          {t("providerLogin.deviceCodeLabel")}
        </span>
        <code
          aria-live="polite"
          className={`block rounded-md border bg-background px-3 py-2 text-center font-mono ${
            copied
              ? "text-[14px] font-medium text-emerald-600 dark:text-emerald-400"
              : "text-[20px] tracking-[0.3em]"
          }`}
        >
          {copied ? t("providerLogin.codeCopied") : code}
        </code>
        <Button type="button" className="w-full gap-1.5" onClick={copyCode}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("providerLogin.codeCopied") : t("providerLogin.copyCode")}
        </Button>
        <p className="text-[12px] text-muted-foreground">
          {t("providerLogin.deviceCodeHint", { name: providerName })}
        </p>
      </div>

      {settingsUrl && (
        <p className="text-[12px] text-muted-foreground">
          <Trans
            t={t}
            i18nKey="providerLogin.deviceSettingsHint"
            components={{
              link: (
                <button
                  type="button"
                  onClick={openSettings}
                  className="font-medium text-foreground underline underline-offset-2"
                />
              ),
            }}
          />
        </p>
      )}

      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Spinner className="size-3.5" />
        {t("providerLogin.deviceWaiting")}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("providerLogin.cancel")}
        </Button>
      </DialogFooter>
    </div>
  );
}
