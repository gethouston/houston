import { Button, DialogFooter, Spinner } from "@houston-ai/core";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-report";
import { tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";

interface Props {
  code: string;
  providerName: string;
  verificationUri: string;
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
  const [copied, setCopied] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `code` is intentionally in deps to reset the copied state whenever a new code prop arrives; the effect body calls only the stable setCopied setter but the trigger is the prop change.
  useEffect(() => {
    setCopied(false);
  }, [code]);
  useEffect(() => {
    return () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  useEffect(() => {
    if (openedRef.current || !verificationUri) return;
    openedRef.current = true;
    void tauriSystem.openUrl(verificationUri, {
      failedTitle: t("providerLogin.deviceOpenFailed"),
      command: "provider_device_open_url",
    });
  }, [verificationUri, t]);

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
    void tauriSystem.openUrl(settingsUrl, {
      failedTitle: t("providerLogin.deviceSettingsOpenFailed"),
      command: "provider_device_open_settings",
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
          className={`block rounded-md border bg-input px-3 py-2 text-center font-mono ${
            copied
              ? "text-[14px] font-medium text-success-ink"
              : "text-[20px] tracking-[0.3em]"
          }`}
        >
          {copied ? t("providerLogin.codeCopied") : code}
        </code>
        <Button type="button" className="w-full gap-1.5" onClick={copyCode}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("providerLogin.codeCopied") : t("providerLogin.copyCode")}
        </Button>
        <p className="text-[12px] text-ink-muted">
          {t("providerLogin.deviceCodeHint", { name: providerName })}
        </p>
      </div>

      {settingsUrl && (
        <p className="text-[12px] text-ink-muted">
          <Trans
            t={t}
            i18nKey="providerLogin.deviceSettingsHint"
            components={{
              link: (
                <button
                  type="button"
                  onClick={openSettings}
                  className="font-medium text-ink underline underline-offset-2"
                />
              ),
            }}
          />
        </p>
      )}

      <div className="flex items-center gap-2 text-[12px] text-ink-muted">
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
