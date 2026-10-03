import type { ProviderReconnectNotice as Notice } from "@houston/sdk";
import { Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import { useReconnectNotice } from "../../hooks/use-reconnect-notice";
import { providerName } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";

/**
 * A quiet pill at the top of the workspace, shown a few days before a hosted
 * Claude subscription login ends (the provider ends it about 28 days after the
 * sign-in). When to show it and what day it reads are the SDK's rules, kept
 * current by `useReconnectNotice`.
 */
export function ProviderReconnectNotice() {
  const { statuses } = useProviderStatuses();
  const notice = useReconnectNotice(statuses);
  if (!notice) return null;
  // Keyed by the deadline: a new login (a new deadline) starts a fresh pill.
  return (
    <ReconnectPill
      key={`${notice.provider}:${notice.reconnectBy}`}
      notice={notice}
    />
  );
}

/**
 * Pressing runs the same sign-in every reconnect surface runs
 * (`tauriProvider.launchLogin`). The spinner covers only the launch: past it,
 * the sign-in's own screen owns the flow, and a finished login refreshes the
 * provider statuses, which moves the deadline out and clears the pill.
 */
function ReconnectPill({ notice }: { notice: Notice }) {
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
      // `launchLogin` already reported the failure; the pill offers a retry.
      setFailed(true);
    } finally {
      setLaunching(false);
    }
  };
  const label =
    notice.daysLeft === 0
      ? t("providerReconnectNotice.dueToday", { provider })
      : t("providerReconnectNotice.dueIn", {
          provider,
          count: notice.daysLeft,
        });
  const action = launching
    ? t("providerReconnect.waiting")
    : failed
      ? t("providerReconnect.launchError")
      : t("providerReconnect.signInAgain");

  return (
    <div className="shrink-0 px-4 pt-3">
      <button
        type="button"
        onClick={signIn}
        disabled={launching}
        data-testid="provider-reconnect-notice"
        className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full border border-line bg-chip-subtle/50 px-3 py-1 text-left text-xs font-medium text-ink transition-colors hover:bg-chip-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-80"
      >
        {launching ? (
          <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <Clock aria-hidden className="size-3.5 shrink-0" />
        )}
        <span>{label}</span>
        <span className="font-semibold underline underline-offset-2">
          {action}
        </span>
      </button>
    </div>
  );
}
