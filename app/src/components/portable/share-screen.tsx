/**
 * The share surface reused by the publish success step and the manage view:
 * the public listing URL with copy + "view listing" (opens externally), and
 * the note that the listing stays unlisted until the creator requests a public
 * spot on the manage page.
 */

import { Button } from "@houston-ai/core";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-toast";
import { osOpenUrl } from "../../lib/os-bridge";
import { useUIStore } from "../../stores/ui";

export function ShareLink({ shareUrl }: { shareUrl: string }) {
  const { t } = useTranslation("portable");
  const addToast = useUIStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch((err: unknown) =>
        addToast({
          variant: "error",
          title: t("publish.errors.copyFailed"),
          description: genericErrorDescription("publish_copy", err),
        }),
      );
  };

  const openListing = () => {
    void osOpenUrl(shareUrl).catch((err: unknown) =>
      addToast({
        variant: "error",
        title: t("publish.errors.openFailed"),
        description: genericErrorDescription("publish_open", err),
      }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-secondary px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {shareUrl}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 rounded-full gap-1.5"
          onClick={copy}
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? t("publish.share.copied") : t("publish.share.copy")}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-full gap-1.5"
        onClick={openListing}
      >
        <ExternalLink className="size-3.5" />
        {t("publish.share.viewListing")}
      </Button>
    </div>
  );
}

export function UnlistedNote() {
  const { t } = useTranslation("portable");
  return (
    <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
      {t("publish.share.unlistedNote")}
    </p>
  );
}
