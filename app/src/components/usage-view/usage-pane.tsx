import {
  Button,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProviderUsage } from "../../hooks/queries";
import type { ProviderInfo } from "../../lib/providers";
import { matchUsageToProviders } from "./usage-model";
import { UsageProviderCard } from "./usage-provider-card";

/**
 * The Usage page's body: one card per CONNECTED provider account with its
 * live meters — rate-limit windows (Claude 5-hour/weekly, Codex
 * session/weekly, Copilot quotas) and prepaid balances, read from each
 * provider's own usage API and refreshed on an interval (see
 * useProviderUsage). Pairing/formatting is the pure usage-model; this view
 * only renders. A fetch failure shows an honest inline error (the query's
 * `call()` wrapper has already toasted).
 */
export function UsagePane({
  providers,
  ready,
  onConnect,
}: {
  /** The CONNECTED provider cards (the same set the hub's strip shows). */
  providers: readonly ProviderInfo[];
  /** Whether the connection probe has resolved (gates the fetch). */
  ready: boolean;
  /** Empty-state CTA: jump to where connecting lives (the AI Models hub). */
  onConnect: () => void;
}) {
  const { t } = useTranslation("aiHub");
  const enabled = ready && providers.length > 0;
  const { data: rows, isLoading, isError } = useProviderUsage(enabled);
  const accounts = useMemo(
    () => matchUsageToProviders(providers, rows ?? []),
    [providers, rows],
  );

  if (ready && providers.length === 0) {
    return (
      <Empty className="mt-6">
        <EmptyTitle>{t("usage.empty.title")}</EmptyTitle>
        <EmptyDescription>{t("usage.empty.body")}</EmptyDescription>
        <Button className="mt-4" onClick={onConnect}>
          {t("usage.empty.connect")}
        </Button>
      </Empty>
    );
  }
  if (!ready || isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (isError) {
    return <p className="py-10 text-sm text-ink-muted">{t("usage.error")}</p>;
  }
  return (
    <ul className="mt-2 grid gap-3 sm:grid-cols-2">
      {accounts.map((account) => (
        <UsageProviderCard key={account.provider.id} account={account} />
      ))}
    </ul>
  );
}
