import { Button, Input } from "@houston-ai/core";
import type { ApiKeyCreated } from "@houston/engine-adapter";
import { apiTryKeyRequest } from "@houston/sdk";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateApiKey } from "../../../hooks/queries/use-api-keys";
import {
  isKeyLimitError,
  isValidKeyName,
  MAX_KEY_NAME_LENGTH,
} from "../../../lib/api-keys-model";
import { genericErrorDescription } from "../../../lib/error-report";
import { useUIStore } from "../../../stores/ui";
import { CodeExample } from "../code-example";

/**
 * Mint an API key, then reveal its secret exactly once: the one flow both the
 * Settings dialog and the AI Manager's chat card run.
 *
 * The secret lives in this hook's LOCAL state only. The mutation never writes
 * it to a query cache (`useCreateApiKey`), `clear()` and unmount drop the
 * mutation's own copy, and nothing here hands it to a caller: a surface renders
 * {@link ApiKeyReveal} and learns only that a key exists. That is what keeps it
 * out of a chat turn, a parked card and every message the app sends.
 */
export interface ApiKeyCreateFlow {
  name: string;
  setName: (name: string) => void;
  revealed: ApiKeyCreated | null;
  pending: boolean;
  limitReached: boolean;
  canSubmit: boolean;
  submit: () => Promise<void>;
  clear: () => void;
}

/** `defaultName` fills the field until the person types (it may arrive late,
 *  once the roster loads). */
export function useApiKeyCreateFlow(defaultName = ""): ApiKeyCreateFlow {
  const create = useCreateApiKey();
  const [typed, setTyped] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<ApiKeyCreated | null>(null);
  const reset = useRef(create.reset);
  reset.current = create.reset;
  useEffect(() => () => reset.current(), []);
  const name = typed ?? defaultName;
  const canSubmit = isValidKeyName(name) && !create.isPending;

  async function submit() {
    if (!canSubmit) return;
    // Caught locally: a genuine failure already surfaced once via `call()`
    // (bug toast + report) and `key_limit` is silenced for the inline notice,
    // so both live in `create.error`. Swallowing the rejection here only stops
    // it reaching the global unhandledrejection handler as a duplicate.
    try {
      setRevealed(await create.mutateAsync(name));
    } catch {
      // handled via create.error / the toast surfaced by call()
    }
  }

  return {
    name,
    setName: setTyped,
    revealed,
    pending: create.isPending,
    limitReached: isKeyLimitError(create.error),
    canSubmit,
    submit,
    clear() {
      setTyped(null);
      setRevealed(null);
      create.reset();
    },
  };
}

/** The key's name, with the inline `key_limit` notice under it. */
export function ApiKeyNameField({
  flow,
  autoFocus,
}: {
  flow: ApiKeyCreateFlow;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="space-y-2">
      <Input
        autoFocus={autoFocus}
        value={flow.name}
        maxLength={MAX_KEY_NAME_LENGTH}
        placeholder={t("apiKeys.create.namePlaceholder")}
        aria-label={t("apiKeys.create.nameLabel")}
        aria-invalid={flow.limitReached}
        disabled={flow.pending}
        onChange={(e) => flow.setName(e.target.value)}
      />
      {flow.limitReached && (
        <p className="text-xs text-danger">
          {t("apiKeys.create.limitReached")}
        </p>
      )}
    </div>
  );
}

/** The one-time reveal: the secret, a Copy button, and the warning. */
export function ApiKeyReveal({ created }: { created: ApiKeyCreated }) {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);
  // The gateway the key works against; only the hosted gateway mints keys.
  const baseUrl = window.__HOUSTON_ENGINE__?.baseUrl ?? null;

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(created.key);
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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-input px-3 py-2">
        {/* Blocked from session replay outright, not just text-masked:
            `ph-no-capture` (PostHog) and `sentry-block` (Sentry, should
            replay ever be turned on) keep the secret out of any recording. */}
        <code className="ph-no-capture sentry-block min-w-0 flex-1 break-all font-mono text-xs text-ink">
          {created.key}
        </code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copyKey()}
          className="shrink-0"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("apiKeys.create.copied") : t("apiKeys.create.copy")}
        </Button>
      </div>
      <p className="flex items-start gap-2 text-xs text-danger">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        {t("apiKeys.create.warning")}
      </p>
      {baseUrl && (
        <CodeExample
          title={t("apiKeys.example.tryTitle")}
          hint={t("apiKeys.example.tryHint")}
          code={apiTryKeyRequest({ baseUrl, key: created.key })}
          secret
        />
      )}
    </div>
  );
}
