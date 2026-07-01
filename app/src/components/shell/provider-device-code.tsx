import { Button, DialogFooter, Spinner } from "@houston-ai/core";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";

/**
 * Device-grant completion panel (codex `--device-auth`): shows the
 * one-time code the user enters on the provider's verification page,
 * plus a waiting indicator and a close button. The CLI polls and
 * completes on its own, so there's no paste-back input — the parent
 * `ProviderLoginDialog` auto-closes on `ProviderLoginComplete`. Rendered
 * only when the engine surfaced a `userCode`. Split out to keep the
 * dialog under the 200-line ceiling.
 */
interface Props {
  code: string;
  providerName: string;
  onClose: () => void;
}

export function ProviderDeviceCode({ code, providerName, onClose }: Props) {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  // Brief inline confirmation: on copy the code box swaps to "Code
  // copied!" for a couple seconds, then reverts. Clearer than a toast for
  // a value the user is about to paste elsewhere — the feedback lands
  // right where they're looking.
  const [copied, setCopied] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (revertTimer.current) clearTimeout(revertTimer.current);
      revertTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      addToast({
        title: t("providerLogin.codeCopyFailed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="block text-[13px] font-medium">
          {t("providerLogin.deviceCodeLabel")}
        </span>
        <div className="flex items-center gap-2">
          <code
            aria-live="polite"
            className={`flex-1 rounded-md border bg-background px-3 py-2 text-center font-mono ${
              copied
                ? "text-[14px] font-medium text-emerald-600 dark:text-emerald-400"
                : "text-[18px] tracking-[0.25em]"
            }`}
          >
            {copied ? t("providerLogin.codeCopied") : code}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t("providerLogin.copyCode")}
            onClick={copyCode}
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground">
          {t("providerLogin.deviceCodeHint", { name: providerName })}
        </p>
      </div>

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
