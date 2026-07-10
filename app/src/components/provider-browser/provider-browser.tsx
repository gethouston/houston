/**
 * The reusable provider marketplace surface: a recognition-first CARD GRID over a
 * pre-gated provider list, an optional sticky search + quick-filter bar, and
 * connect / cancel / sign-out via the shared `ProviderConnections`. Extracted
 * from the AI Hub's Providers tab so onboarding / migration / workspace-setup
 * reuse it; it never imports from `components/ai-hub/` (the hub composes this).
 *
 * Pipeline mirrors the hub: quick filter -> search -> featured-first pin ->
 * Connected/Available grouping. Cards render statically (no `layout` animation)
 * so the grid never reflows on a modal's scroll-lock. The opt-in `curated` mode
 * instead shows a short featured set split by Subscription / API key with a
 * "see all" expansion (see `CuratedProviderSections`) — used only by onboarding.
 */

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
import { groupProviders } from "./provider-grouping";
import { useProviderAutoSelect } from "./use-provider-auto-select";

export interface ProviderBrowserProps {
  /** Pre-gated provider list (a `getConnectProviders` result). */
  providers: readonly ProviderInfo[];
  /** Connect machinery from `useProviderConnections()`. */
  connections: ProviderConnections;
  /** Model counts + provider modal source; `undefined` while the catalog loads. */
  catalog: HubCatalog | undefined;
  /**
   * Fires when a provider becomes connected (a not-connected -> connected
   * transition), with the model resolved as `provider.defaultModel ||
   * status.active_model`. Also fires for an already-connected provider detected
   * on the FIRST status load when `selectOnMount` is true.
   */
  onSelect?: (providerId: string, model: string) => void;
  /** Auto-select an already-connected provider on the first load (onboarding). */
  selectOnMount?: boolean;
  /** Show the search bar + quick-filter dropdown. Default true. */
  showFilters?: boolean;
  /** Render the connect-dialog stack internally. Default true; the hub passes false. */
  renderDialogs?: boolean;
  /**
   * Open a provider's detail. When omitted the card's info button is hidden (no
   * dead affordance). NOTE: not part of the originally pinned contract — added
   * because `ProviderModal` is too hub-coupled to move here, so the consumer
   * owns the modal. See the wave-1 report.
   */
  onOpen?: (provider: ProviderInfo) => void;
  /**
   * Curated onboarding mode (OPT-IN, default off). Shows only the "most popular"
   * providers, split into Subscription / API-key Sections, with a "see all" chip
   * that expands to the full list. Every other consumer (AI Hub, migration,
   * workspace setup) leaves this off and keeps the Connected / Available list.
   */
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
  onOpen,
  curated = false,
  className,
}: ProviderBrowserProps) {
  const { t } = useTranslation("aiHub");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProviderQuickFilter>("all");
  // Curated-mode "see all" toggle: collapsed to the featured set until expanded.
  const [expanded, setExpanded] = useState(false);

  // Auto-advance onboarding / dismiss the migration gate on a live connect.
  useProviderAutoSelect(connections, providers, onSelect, selectOnMount);

  // Apply the quick filter, then the free-text query, then pin featured providers
  // to the front. Grouping preserves this order within each section.
  const filtered = useMemo(
    () =>
      orderFeaturedFirst(
        searchProviders(filterByQuickFilter(providers, filter), query),
      ),
    [providers, filter, query],
  );

  // Until the first status probe resolves we don't know which providers are
  // connected, so a live Connect button would be the wrong state. Hold a quiet
  // skeleton in place instead of guessing.
  if (!connections.ready) {
    return <ProviderBrowserSkeleton count={providers.length || 8} />;
  }

  // A live search or a non-`all` quick filter is explicit "find this provider"
  // intent, so it bypasses curated mode's featured narrowing and shows the full
  // filtered set (still grouped by the curated Sections); the "see all" chip is
  // meaningless then and hides. `curatedDisplay` folds those rules into the set
  // we render + whether more remain hidden.
  const searching = query.trim() !== "" || filter !== "all";
  const { displayed, hasMore } = curatedDisplay(
    filtered,
    curated,
    expanded,
    searching,
  );
  const { connected, available } = groupProviders(
    displayed,
    connections.isConnected,
  );
  const row = makeProviderRow({ connections, catalog, onOpen });

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
          <Section label={t("sections.connected")} count={connected.length}>
            {connected.map(row)}
          </Section>
          <Section label={t("sections.available")} count={available.length}>
            {available.map(row)}
          </Section>
        </div>
      )}
      {renderDialogs && (
        <ProviderConnectionDialogs
          {...connections.dialogProps}
          // The local (OpenAI-compatible) provider's model is user-typed in the
          // dialog and never in the catalog, so the connect hands it to `onSelect`
          // directly (the legacy picker did the same). No double fire: the later
          // status transition resolves `defaultModel ("") || active_model (absent)`
          // to nothing and skips, and the reconcile itself is no transition.
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
