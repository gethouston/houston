import { cn } from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import type { ProviderInfo } from "../../lib/providers";
import {
  CuratedProviderSections,
  makeProviderRow,
  ProviderBrowserSkeleton,
  ProviderEmpty,
  Section,
} from "./provider-browser-sections";
import { ProviderConnectionDialogs } from "./provider-connection-dialogs";
import { ProviderFilterBar } from "./provider-filter-bar";
import {
  curatedDisplay,
  filterByQuickFilter,
  orderFeaturedFirst,
  type ProviderQuickFilter,
  searchProviders,
} from "./provider-filtering";
import { groupProviders, providerOwnedSide } from "./provider-grouping";
import { useProviderAutoSelect } from "./use-provider-auto-select";

export interface ProviderBrowserProps {
  providers: readonly ProviderInfo[];
  connections: ProviderConnections;
  catalog: HubCatalog | undefined;
  onSelect?: (providerId: string, model: string) => void;
  selectOnMount?: boolean;
  showFilters?: boolean;
  renderDialogs?: boolean;
  curated?: boolean;
  className?: string;
}

export function ProviderBrowser({
  providers,
  connections,
  catalog,
  onSelect,
  selectOnMount = false,
  showFilters = true,
  renderDialogs = true,
  curated = false,
  className,
}: ProviderBrowserProps) {
  const { t } = useTranslation("aiHub");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProviderQuickFilter>("all");
  const [expanded, setExpanded] = useState(false);

  useProviderAutoSelect(connections, providers, onSelect, selectOnMount);

  const filtered = useMemo(
    () =>
      orderFeaturedFirst(
        searchProviders(filterByQuickFilter(providers, filter), query),
      ),
    [providers, filter, query],
  );

  if (!connections.ready) {
    return <ProviderBrowserSkeleton count={providers.length || 8} />;
  }

  const searching = query.trim() !== "" || filter !== "all";
  const { displayed, hasMore } = curatedDisplay(
    filtered,
    curated,
    expanded,
    searching,
  );
  const groups = groupProviders(displayed, connections.connectionState);
  const owned = providerOwnedSide(groups);
  const available = groups.available;
  const row = makeProviderRow({ connections, catalog });

  return (
    <div className={cn("flex flex-col", className)}>
      {showFilters && (
        <ProviderFilterBar
          query={query}
          setQuery={setQuery}
          filter={filter}
          setFilter={setFilter}
          showQuickFilters={!curated}
        />
      )}
      {displayed.length === 0 ? (
        <ProviderEmpty
          title={t("providers.empty.title")}
          description={t("providers.empty.description")}
        />
      ) : curated ? (
        <CuratedProviderSections
          providers={displayed}
          row={row}
          expanded={expanded}
          hasMore={hasMore}
          onExpand={() => setExpanded(true)}
          labels={{
            subscription: t("sections.subscription"),
            apiKey: t("sections.apiKey"),
            seeAll: t("providers.seeAll"),
          }}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <Section label={t("sections.connected")} count={owned.length}>
            {owned.map(row)}
          </Section>
          <Section label={t("sections.available")} count={available.length}>
            {available.map(row)}
          </Section>
        </div>
      )}
      {renderDialogs && (
        <ProviderConnectionDialogs
          {...connections.dialogProps}
          onLocalConnected={
            onSelect
              ? (model) => onSelect("openai-compatible", model)
              : undefined
          }
        />
      )}
    </div>
  );
}
