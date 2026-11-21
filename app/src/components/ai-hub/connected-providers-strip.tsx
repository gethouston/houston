import { CatalogGrid, CatalogShowMore } from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProviderUsage } from "../../hooks/queries";
import { installedPreview } from "../../lib/installed-preview";
import type { ProviderConnectionState } from "../../lib/provider-connection";
import type { ProviderInfo } from "../../lib/providers";
import { ConnectedProviderRow } from "./connected-provider-row";
import {
  hasConfirmedAccount,
  matchUsageToProviders,
  type UsageFetchState,
} from "./provider-usage-model";
import { formatReadingAge } from "./provider-usage-window";

const CONNECTED_PREVIEW_CAP = 3;

export function ConnectedProvidersStrip({
  providers,
  connectionState,
  searching,
  onOpen,
}: {
  providers: readonly ProviderInfo[];
  connectionState: (provider: ProviderInfo) => ProviderConnectionState;
  searching: boolean;
  onOpen: (provider: ProviderInfo) => void;
}) {
  const { t, i18n } = useTranslation("aiHub");
  const [expanded, setExpanded] = useState(false);
  const enabled = useMemo(
    () => hasConfirmedAccount(providers, connectionState),
    [providers, connectionState],
  );
  const {
    data: usageRows,
    isLoading,
    isError,
    dataUpdatedAt,
  } = useProviderUsage(enabled);
  const usageFetchState: UsageFetchState = isLoading
    ? "loading"
    : isError && !usageRows
      ? "error"
      : "ready";
  const staleReadingAge =
    isError && usageRows
      ? formatReadingAge(dataUpdatedAt, i18n.language)
      : null;

  const { visible: rows, showExpander } = installedPreview(providers, {
    searching,
    expanded,
    cap: CONNECTED_PREVIEW_CAP,
  });
  const accounts = useMemo(
    () => matchUsageToProviders(rows, usageRows ?? []),
    [rows, usageRows],
  );

  return (
    <div>
      <CatalogGrid className="gap-2">
        {accounts.map((account) => (
          <ConnectedProviderRow
            key={account.provider.id}
            account={account}
            connectionState={connectionState(account.provider)}
            usageFetchState={usageFetchState}
            onOpen={() => onOpen(account.provider)}
          />
        ))}
      </CatalogGrid>
      {showExpander && (
        <CatalogShowMore onClick={() => setExpanded(true)}>
          {t("search.showAll", { count: providers.length })}
        </CatalogShowMore>
      )}
      {staleReadingAge && (
        <p className="mt-2 text-xs text-ink-muted" role="status">
          {t("providerUsage.staleReading", { when: staleReadingAge })}
        </p>
      )}
    </div>
  );
}
