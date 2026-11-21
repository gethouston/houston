import type { ProviderReconnectNotice as Notice } from "@houston/sdk";
import { Button } from "@houston-ai/core";
import { Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import { useReconnectNotice } from "../../hooks/use-reconnect-notice";
import { providerName } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";

export function ProviderReconnectNotice() {
  const { statuses } = useProviderStatuses();
  const notice = useReconnectNotice(statuses);
  if (!notice) return null;
  return (
    <ReconnectStrip
      key={`${notice.provider}:${notice.reconnectBy}`}
      notice={notice}
    />
  );
}

function ReconnectStrip({ notice }: { notice: Notice }) {
  const { t } = useTranslation("shell");
  const [launching, setLaunching] = useState(false);
  const [failed, setFailed] = useState(false);
  const provider = providerName(notice.provider);

  const signIn = async () => {
    setLaunching(true);
    try {
      await tauriProvider.launchLogin(notice.provider);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLaunching(false);
    }
  };
  const message = launching
    ? t("providerReconnect.waiting")
    : failed
      ? t("providerReconnect.launchError")
      : notice.daysLeft === 0
        ? t("providerReconnectNotice.dueToday", { provider })
        : t("providerReconnectNotice.dueIn", {
            provider,
            count: notice.daysLeft,
          });

  return (
    <div
      role="status"
      data-testid="provider-reconnect-notice"
      className="flex shrink-0 items-center gap-2.5 border-b border-warning/15 bg-warning/10 py-1.5 pr-1.5 pl-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
    >
      <Clock aria-hidden className="size-3.5 shrink-0 text-warning-ink" />
      <p className="min-w-0 flex-1 text-[13px] text-balance text-ink">
        {message}
      </p>
      <Button
        size="xs"
        variant="outline"
        onClick={signIn}
        disabled={launching}
        className="px-2.5 border-warning/30 active:scale-[0.97] disabled:opacity-80 dark:border-warning/30"
      >
        {launching && <Loader2 aria-hidden className="animate-spin" />}
        {t("providerReconnect.signInAgain")}
      </Button>
    </div>
  );
}
