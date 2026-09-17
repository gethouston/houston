import type { ApiKeyCreated } from "@houston/engine-adapter";
import { Button, FormDialog, Input } from "@houston-ai/core";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateApiKey } from "../../../hooks/queries/use-api-keys";
import {
  isKeyLimitError,
  MAX_KEY_NAME_LENGTH,
} from "../../../lib/api-keys-model";
import { genericErrorDescription } from "../../../lib/error-report";
import { useUIStore } from "../../../stores/ui";

interface ApiKeyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mint an API key, then reveal its secret exactly once.
 *
 * ONE `FormDialog` wearing two faces: a name form, then the show-once view.
 * The swap is what the recipe's `false` outcome is for — the mint SUCCEEDED,
 * so a dialog that closed on resolve would carry the only copy of the secret
 * off screen with it. The key lives in LOCAL state only (never the query
 * cache) and every close clears it, so it cannot linger behind the dialog.
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
    // Caught locally: a genuine failure already surfaced once via `call()`
    // (bug toast + report) and `key_limit` is silenced for the inline notice
    // below, so both live in `create.error`. Swallowing the rejection here only
    // stops it reaching the global unhandledrejection handler as a duplicate.
    try {
      setRevealed(await create.mutateAsync(name));
    } catch {
      // handled via create.error / the toast surfaced by call()
    }
    // Either outcome keeps the dialog: the secret has to be read once, and a
    // refused mint keeps the typed name beside its inline notice. The recipe's
    // re-entry guard is what stops a second Enter minting a second key and
    // losing the first secret forever.
    return false;
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

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={
        revealed ? t("apiKeys.create.revealTitle") : t("apiKeys.create.title")
      }
      description={
        revealed
          ? t("apiKeys.create.revealSubtitle", { name: revealed.name })
          : t("apiKeys.create.subtitle")
      }
      primary={
        revealed
          ? { label: t("apiKeys.create.done") }
          : {
              label: t("apiKeys.create.submit"),
              onClick: submit,
              disabled: name.trim().length === 0,
            }
      }
      // Nothing left to cancel once the key exists: the secret is the only
      // thing on screen and reading it is the one way out.
      secondary={revealed ? null : undefined}
      labels={{
        cancel: t("apiKeys.create.cancel"),
        close: t("apiKeys.dialogClose"),
      }}
    >
      {revealed ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-input px-3 py-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-ink">
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
          <p className="flex items-start gap-2 text-xs text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {t("apiKeys.create.warning")}
          </p>
        </>
      ) : (
        <div className="space-y-2">
          <Input
            autoFocus
            value={name}
            maxLength={MAX_KEY_NAME_LENGTH}
            placeholder={t("apiKeys.create.namePlaceholder")}
            aria-label={t("apiKeys.create.nameLabel")}
            aria-invalid={limitReached}
            onChange={(e) => setName(e.target.value)}
          />
          {limitReached && (
            <p className="text-xs text-danger">
              {t("apiKeys.create.limitReached")}
            </p>
          )}
        </div>
      )}
    </FormDialog>
  );
}
