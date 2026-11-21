import { Button, cn } from "@houston-ai/core";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-report";
import { useUIStore } from "../../stores/ui";

interface CodeExampleProps {
  title: string;
  hint: string;
  code: string;
  secret?: boolean;
}

export function CodeExample({ title, hint, code, secret }: CodeExampleProps) {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      addToast({ title: t("apiKeys.idRow.copied") });
    } catch (err) {
      addToast({
        title: t("apiKeys.example.copyFailed"),
        description: genericErrorDescription("copy_api_example", err),
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">
          {title}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => void copy()}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("apiKeys.idRow.copied") : t("apiKeys.idRow.copy")}
        </Button>
      </div>
      <pre
        className={cn(
          "overflow-x-auto rounded-lg border border-line bg-input px-3 py-2 font-mono text-xs text-ink",
          secret && "ph-no-capture sentry-block",
        )}
      >
        <code>{code}</code>
      </pre>
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  );
}
