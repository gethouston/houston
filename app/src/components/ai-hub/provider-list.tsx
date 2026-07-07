import { cn } from "@houston-ai/core";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import {
  providerCostLine,
  providerDescription,
} from "../../lib/provider-overrides";
import type { ProviderInfo } from "../../lib/providers";
import { SectionHeader } from "./hub-badges";
import {
  filterByQuickFilter,
  orderFeaturedFirst,
  type ProviderQuickFilter,
  searchProviders,
} from "./provider-filtering";
import { ProviderFilters } from "./provider-filters";
import { groupProviders, providerModels } from "./provider-grouping";
import { ProviderRow } from "./provider-row";
import { useStuckOnScroll } from "./use-stuck-on-scroll";

interface ProviderListProps {
  providers: readonly ProviderInfo[];
  connections: ProviderConnections;
  catalog: HubCatalog;
  onOpen: (provider: ProviderInfo) => void;
}

/** A titled 2-column grid of cards. Hidden when it has no children. */
function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode[];
}) {
  if (children.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader label={label} count={count} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** A calm placeholder when the search / quick filter matches no provider. */
function ProviderEmpty() {
  const { t } = useTranslation("aiHub");
  return (
    <div className="ht-hairline flex flex-col items-center gap-1 rounded-2xl bg-secondary px-6 py-16 text-center">
      <p className="text-[15px] font-medium text-foreground">
        {t("providers.empty.title")}
      </p>
      <p className="text-[13px] text-muted-foreground">
        {t("providers.empty.description")}
      </p>
    </div>
  );
}

/**
 * The provider marketplace: a sticky search + quick-filter bar, then a colorful
 * 2-column CARD GRID — Connected first (featured pinned to the front), then
 * Available. The grid mirrors the Integrations tab so the two surfaces read as
 * one system: recognition first — a big full-color brand mark the eye lands on,
 * the name, then the bold live model count and the friendly cost story. Each
 * card opens the provider modal on body click or its info button. Cards render
 * statically (no `layout` animation) so the grid never reflows when a modal's
 * scroll-lock changes the content width; the parent's tab crossfade is the only
 * entrance motion, and a connect that flips a provider between groups just
 * re-renders. The Providers-tab ordering only — the chat picker is untouched.
 */
export function ProviderList({
  providers,
  connections,
  catalog,
  onOpen,
}: ProviderListProps) {
  const { t } = useTranslation("aiHub");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProviderQuickFilter>("all");
  const { sentinelRef, stuck } = useStuckOnScroll();

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
    return <ProviderListSkeleton count={providers.length || 8} />;
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
      modelCount={providerModels(catalog, provider).length}
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
    <div className="flex flex-col">
      {/* Sentinel marking the filter bar's natural top (see useStuckOnScroll). */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      {/* The search + quick-filter bar as ONE sticky unit pinned to the top of the
          shared scroll region, so the provider grid passes cleanly BEHIND it.
          Mirrors the Models tab's `ModelsBrowser`: transparent at rest, fading
          in the frosted-glass `bg-popover` fill (blur masks the scrolling rows)
          only once pinned — same offset (`top-0`), z-index (`z-20`), rounding
          (`rounded-b-2xl`: the pinned bar sits flush under the masthead, so only
          its bottom edge floats over content) and `shadow-none!` so the two tabs
          feel identical. */}
      <div
        className={cn(
          "sticky top-0 z-20 transition-colors",
          stuck ? "rounded-b-2xl bg-popover shadow-none!" : "",
        )}
      >
        <div className="pt-1 pb-3">
          <ProviderFilters
            query={query}
            setQuery={setQuery}
            filter={filter}
            setFilter={setFilter}
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <ProviderEmpty />
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
    </div>
  );
}

/**
 * Placeholder grid shown while the first provider-status probe is in flight.
 * Muted, pulsing CARDS matching the real geometry — enough to hold the layout
 * without implying any connect state before we actually know it.
 */
function ProviderListSkeleton({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static placeholder grid, no reordering.
          key={i}
          className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5"
        >
          <div className="size-8 shrink-0 animate-pulse rounded-lg bg-accent" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-accent" />
            <div className="h-2.5 w-32 animate-pulse rounded bg-accent" />
          </div>
          <div className="h-8 w-[92px] shrink-0 animate-pulse rounded-full bg-accent" />
        </div>
      ))}
    </div>
  );
}
