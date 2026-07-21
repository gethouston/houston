import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type { WebhookKeyReveal } from "@houston-ai/engine-client";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";

interface Props {
  /** The freshly minted key to reveal, or null when the dialog is closed. The
   *  secret NEVER lands in the query cache or routine data: it lives only in the
   *  parent chip's local state, which this dialog clears on close. */
  revealed: WebhookKeyReveal | null;
  /** Clears the revealed key in the parent (which unmounts the secret). */
  onClose: () => void;
}

/**
 * Reveal a minted webhook address and secret exactly once, mirroring the API
 * key create dialog: the secret is held only in the parent chip's local state
 * (never the query cache), each value has its own copy button, and a loud
 * one-line warning says it will not be shown again. Closing clears everything.
 */
export function WebhookKeyDialog({ revealed, onClose }: Props) {
  const { t } = useTranslation("routines");
  const addToast = useUIStore((s) => s.addToast);
  const [copied, setCopied] = useState<"url" | "secret" | null>(null);

  // Reset the copied affordance whenever the dialog closes, so reopening for a
  // rotated key never shows a stale check mark.
  useEffect(() => {
    if (!revealed) setCopied(null);
  }, [revealed]);

  async function copy(field: "url" | "secret", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      addToast({ title: t("webhook.dialog.copied") });
    } catch (err) {
      addToast({
        title: t("webhook.dialog.copyFailed"),
        description: genericErrorDescription("copy_webhook_key", err),
        variant: "error",
      });
    }
  }

  return (
    <Dialog open={!!revealed} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t("webhook.dialog.close")}>
        {revealed && (
          <>
            <DialogHeader>
              <DialogTitle>{t("webhook.dialog.title")}</DialogTitle>
              <DialogDescription>
                {t("webhook.dialog.subtitle")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <SecretRow
                copied={copied === "url"}
                copyLabel={t("webhook.dialog.copy")}
                copiedLabel={t("webhook.dialog.copied")}
                label={t("webhook.dialog.urlLabel")}
                onCopy={() => void copy("url", revealed.url)}
                value={revealed.url}
              />
              <SecretRow
                copied={copied === "secret"}
                copyLabel={t("webhook.dialog.copy")}
                copiedLabel={t("webhook.dialog.copied")}
                label={t("webhook.dialog.secretLabel")}
                onCopy={() => void copy("secret", revealed.secret)}
                value={revealed.secret}
              />
            </div>
            <p className="flex items-start gap-2 text-destructive text-xs">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {t("webhook.dialog.warning")}
            </p>
            <DialogFooter>
              <Button onClick={onClose}>{t("webhook.dialog.done")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SecretRow({
  label,
  value,
  copied,
  copyLabel,
  copiedLabel,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1">
      <span className="font-medium text-ink-muted text-xs">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-foreground text-xs">
          {value}
        </code>
        <Button className="shrink-0" onClick={onCopy} size="sm" variant="ghost">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
    </div>
  );
}
