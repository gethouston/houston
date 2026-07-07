/**
 * The reusable provider marketplace surface. A colorful, recognition-first
 * CARD GRID over a pre-gated provider list: an optional sticky search +
 * quick-filter bar, then Connected cards first (featured pinned to the front)
 * and Available cards, each opening a provider detail (via `onOpen`) and driving
 * connect / cancel / sign-out through the shared `ProviderConnections`.
 *
 * Extracted from the AI Hub's Providers tab so onboarding / migration /
 * workspace-setup can reuse the exact same surface. It never imports from
 * `components/ai-hub/` — the dependency points the other way (the hub composes
 * this). `lib/ai-hub/` is the shared catalog data layer, which both consume.
 *
 * The pipeline mirrors the hub: quick filter -> free-text search ->
 * featured-first pin -> Connected/Available grouping. Cards render statically
 * (no `layout` animation) so the grid never reflows when a modal's scroll-lock
 * changes the content width; a connect that flips a card between groups just
 * re-renders.
 */

import { cn } from "@houston-ai/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import {
  providerCostLine,
  providerDescription,
} from "../../lib/provider-overrides";
import type { ProviderInfo } from "../../lib/providers";
import { resolveAutoSelect, type StatusSnapshot } from "./auto-select";
import {
  ProviderBrowserSkeleton,
  ProviderEmpty,
  Section,
} from "./provider-browser-sections";
import { ProviderConnectionDialogs } from "./provider-connection-dialogs";
import { ProviderFilterBar } from "./provider-filter-bar";
import {
  filterByQuickFilter,
  orderFeaturedFirst,
  type ProviderQuickFilter,
  searchProviders,
} from "./provider-filtering";
import { groupProviders, providerModels } from "./provider-grouping";
import { ProviderRow } from "./provider-row";

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
  className,
}: ProviderBrowserProps) {
  const { t } = useTranslation("aiHub");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProviderQuickFilter>("all");

  // Watch the connect-status snapshots for a not-connected -> connected
  // transition and hand the newly-connected provider + model to `onSelect`. The
  // status hook already fires `provider_configured` analytics, so this does not.
  // Gated on `probed`, not `ready`: `ready` flips true off the cached last-scan
  // snapshot, and a stale cached "connected" must never auto-advance onboarding
  // or dismiss the migration gate before a live probe confirms it.
  const prevStatuses = useRef<StatusSnapshot | null>(null);
  useEffect(() => {
    if (!onSelect || !connections.probed) return;
    const selection = resolveAutoSelect(
      prevStatuses.current,
      connections.statuses,
      providers,
      { selectOnMount },
    );
    prevStatuses.current = connections.statuses;
    if (selection) onSelect(selection.providerId, selection.model);
  }, [
    onSelect,
    connections.probed,
    connections.statuses,
    providers,
    selectOnMount,
  ]);

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

  const { connected, available } = groupProviders(
    filtered,
    connections.isConnected,
  );

  // Secondary line: the live model count (bold, in the card), then the friendly
  // cost prose (the money story a non-technical user cares about), falling back
  // to the one-line provider description for the uncurated providers that carry
  // no cost line.
  const row = (provider: ProviderInfo) => (
    <ProviderRow
      key={provider.id}
      provider={provider}
      modelCount={catalog ? providerModels(catalog, provider).length : 0}
      description={
        providerCostLine(provider.id) ?? providerDescription(provider.id)
      }
      connected={connections.isConnected(provider)}
      connecting={connections.busy[provider.id] === "connecting"}
      signingOut={connections.busy[provider.id] === "signingOut"}
      onOpen={onOpen}
      onConnect={connections.connect}
      onCancel={connections.cancel}
      onSignOut={connections.signOut}
    />
  );

  return (
    <div className={cn("flex flex-col", className)}>
      {showFilters && (
        <ProviderFilterBar
          query={query}
          setQuery={setQuery}
          filter={filter}
          setFilter={setFilter}
        />
      )}
      {filtered.length === 0 ? (
        <ProviderEmpty
          title={t("providers.empty.title")}
          description={t("providers.empty.description")}
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
          // dialog and never in the catalog, so the connect hands it to
          // `onSelect` directly (the legacy picker did the same). No double
          // fire: the subsequent status transition resolves
          // `defaultModel ("") || active_model (absent until the reconcile)`
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
