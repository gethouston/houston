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
import {
  type AccountUsage,
  matchUsageToProviders,
  splitAccountsByBilling,
} from "./usage-model";
import { UsageProviderCard } from "./usage-provider-card";

/**
 * The Usage page's body, in TWO billing sections: "AI subscriptions" (OAuth
 * plan accounts whose rate-limit windows reset — Claude 5-hour/weekly, Codex
 * session/weekly, Copilot quotas) and "AI per token" (API-key accounts billed
 * by what they use — prepaid balances or Houston's own token metering). One
 * card per CONNECTED account, read from each provider's usage API and
 * refreshed on an interval (see useProviderUsage). Pairing/splitting is the
 * pure usage-model; this view only renders. A fetch failure shows an honest
 * inline error (the query's `call()` wrapper has already toasted).
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
  const { subscriptions, perToken } = useMemo(
    () => splitAccountsByBilling(matchUsageToProviders(providers, rows ?? [])),
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
    <div className="flex flex-col gap-6">
      <UsageSection sectionKey="subscriptions" accounts={subscriptions} />
      <UsageSection sectionKey="perToken" accounts={perToken} />
    </div>
  );
}

/**
 * One labeled billing section (header + card grid). An empty section renders
 * nothing — a user with only one kind of account sees one clean section, not
 * an empty shell.
 */
function UsageSection({
  sectionKey,
  accounts,
}: {
  sectionKey: "subscriptions" | "perToken";
  accounts: readonly AccountUsage[];
}) {
  const { t } = useTranslation("aiHub");
  if (accounts.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-medium text-ink">
        {t(`usage.sections.${sectionKey}.title`)}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {accounts.map((account) => (
          <UsageProviderCard key={account.provider.id} account={account} />
        ))}
      </ul>
    </section>
  );
}
