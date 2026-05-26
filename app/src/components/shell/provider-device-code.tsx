import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { Button, DialogFooter, Spinner } from "@houston-ai/core";
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

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      addToast({ title: t("providerLogin.codeCopied"), variant: "success" });
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
          <code className="flex-1 rounded-md border bg-background px-3 py-2 text-center text-[18px] font-mono tracking-[0.25em]">
            {code}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t("providerLogin.copyCode")}
            onClick={copyCode}
          >
            <Copy className="size-3.5" />
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
