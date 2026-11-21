import type { ApiKeyCreated } from "@houston/engine-adapter";
import { apiTryKeyRequest } from "@houston/sdk";
import { Button, Input } from "@houston-ai/core";
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
    try {
      setRevealed(await create.mutateAsync(name));
    } catch {}
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

export function ApiKeyReveal({ created }: { created: ApiKeyCreated }) {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);
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
