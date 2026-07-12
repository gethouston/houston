import {
  AsyncButton,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@houston-ai/core";
import type { ApiKeyCreated } from "@houston-ai/engine-client";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateApiKey } from "../../../hooks/queries/use-api-keys";
import {
  isKeyLimitError,
  MAX_KEY_NAME_LENGTH,
} from "../../../lib/api-keys-model";
import { genericErrorDescription } from "../../../lib/error-toast";
import { useUIStore } from "../../../stores/ui";

interface ApiKeyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mint an API key, then reveal its secret exactly once. The dialog swaps from a
 * name form to a show-once view holding the full key in LOCAL state only (never
 * the query cache), and clears everything on close so the secret cannot linger.
 */
export function ApiKeyCreateDialog({
  open,
  onOpenChange,
}: ApiKeyCreateDialogProps) {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const create = useCreateApiKey();
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  // Synchronous in-flight guard shared by BOTH submit paths (the AsyncButton
  // click and the Enter keydown). A ref flips immediately, before React can
  // re-render, so two rapid Enters can never mint two keys and lose the first
  // secret forever — `create.isPending` alone lags a render behind.
  const submitting = useRef(false);

  function close() {
    // Clear the local secret + form on every close so a revealed key never
    // survives the dialog. `create.reset()` drops the mutation's cached result
    // (which also carries the secret) and any inline error.
    setName("");
    setRevealed(null);
    setCopied(false);
    create.reset();
    onOpenChange(false);
  }

  async function submit() {
    // One mint at a time: bail if a create is already in flight (Enter pressed
    // twice, or Enter racing the button). Without this the second call mints a
    // second key whose secret is shown once and then lost.
    if (submitting.current || create.isPending) return;
    submitting.current = true;
    // Caught locally: a genuine failure already surfaced once via `call()`
    // (bug toast + report) and `key_limit` is silenced for the inline notice
    // below, so both live in `create.error`. Swallowing the rejection here only
    // stops it reaching the global unhandledrejection handler as a duplicate.
    try {
      setRevealed(await create.mutateAsync(name));
    } catch {
      // handled via create.error / the toast surfaced by call()
    } finally {
      submitting.current = false;
    }
  }

  async function copyKey() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.key);
      setCopied(true);
      addToast({ title: t("apiKeys.create.copied") });
    } catch (err) {
      addToast({
        title: t("apiKeys.create.copyFailed"),
        description: genericErrorDescription("copy_api_key", err),
        variant: "error",
      });
    }
  }

  const limitReached = isKeyLimitError(create.error);
  const canSubmit = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent closeLabel={t("apiKeys.dialogClose")}>
        {revealed ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("apiKeys.create.revealTitle")}</DialogTitle>
              <DialogDescription>
                {t("apiKeys.create.revealSubtitle", { name: revealed.name })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                {revealed.key}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void copyKey()}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? t("apiKeys.create.copied") : t("apiKeys.create.copy")}
              </Button>
            </div>
            <p className="flex items-start gap-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {t("apiKeys.create.warning")}
            </p>
            <DialogFooter>
              <Button onClick={close}>{t("apiKeys.create.done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("apiKeys.create.title")}</DialogTitle>
              <DialogDescription>
                {t("apiKeys.create.subtitle")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Input
                autoFocus
                value={name}
                maxLength={MAX_KEY_NAME_LENGTH}
                placeholder={t("apiKeys.create.namePlaceholder")}
                aria-label={t("apiKeys.create.nameLabel")}
                aria-invalid={limitReached}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) void submit();
                }}
              />
              {limitReached && (
                <p className="text-xs text-destructive">
                  {t("apiKeys.create.limitReached")}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                {t("apiKeys.create.cancel")}
              </Button>
              <AsyncButton onClick={submit} disabled={!canSubmit}>
                {t("apiKeys.create.submit")}
              </AsyncButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
