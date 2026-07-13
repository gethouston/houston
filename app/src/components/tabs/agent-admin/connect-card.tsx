import { Button, Skeleton } from "@houston-ai/core";
import { Copy, ExternalLink, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../../lib/error-toast";
import { tauriSystem } from "../../../lib/tauri";
import { useUIStore } from "../../../stores/ui";

export interface ConnectCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  addressLabel: string;
  /** `null` while the address can't be built yet (orgs list still loading). */
  address: string | null;
  docsUrl: string;
}

/**
 * One way into the agent from outside (Connect section): icon + plain-language
 * pitch + the copyable public address + a "learn how" link into the matching
 * developer-docs page (opened in the OS browser).
 */
export function ConnectCard({
  icon: Icon,
  title,
  description,
  addressLabel,
  address,
  docsUrl,
}: ConnectCardProps) {
  const { t } = useTranslation("connect");
  const addToast = useUIStore((s) => s.addToast);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      addToast({ title: t("cards.copied") });
    } catch (err) {
      addToast({
        title: t("cards.copyFailed"),
        description: genericErrorDescription("copy_connect_address", err),
        variant: "error",
      });
    }
  }

  return (
    <section className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-ink-muted" />
        <h3 className="flex-1 text-sm font-medium text-ink">{title}</h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void tauriSystem.openUrl(docsUrl)}
        >
          <ExternalLink className="size-3.5" />
          {t("cards.docs")}
        </Button>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>
      <div className="mt-2 flex items-center gap-2">
        {address ? (
          <>
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line-input bg-input px-2.5 py-1.5 font-mono text-xs text-ink">
              <span className="sr-only">{addressLabel}: </span>
              {address}
            </code>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => void copyAddress()}
            >
              <Copy className="size-3.5" />
              {t("cards.copy")}
            </Button>
          </>
        ) : (
          <Skeleton className="h-8 w-full rounded-lg" />
        )}
      </div>
    </section>
  );
}
