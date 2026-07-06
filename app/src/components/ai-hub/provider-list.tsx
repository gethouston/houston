import { cn } from "@houston-ai/core";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import { providerDescription } from "../../lib/provider-overrides";
import type { ProviderInfo } from "../../lib/providers";
import { SectionHeader } from "./hub-badges";
import {
  filterByCategory,
  orderFeaturedFirst,
  type ProviderCategoryFilter,
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

/** A titled, hairline-divided list of rows. Hidden when it has no children. */
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
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

/** A calm placeholder when the search / category filter matches no provider. */
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
 * The provider marketplace: a sticky search + category filter bar, then a quiet,
 * scannable LIST — Connected rows first (featured pinned to the front), then
 * Available. A list beats a card grid now that ~35 providers surface; each row
 * carries the brand glyph, name, a muted secondary, and one Connect / Sign out
 * action, and opens the provider modal on body click (see `ProviderRow`). Rows
 * render statically (no `layout` animation) so the list never reflows when a
 * modal's scroll-lock changes the content width; the parent's tab crossfade is
 * the only entrance motion, and a connect that flips a provider between groups
 * just re-renders. The Providers-tab ordering only — the chat picker is
 * untouched.
 */
export function ProviderList({
  providers,
  connections,
  catalog,
  onOpen,
}: ProviderListProps) {
  const { t } = useTranslation("aiHub");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProviderCategoryFilter>("all");
  const { sentinelRef, stuck } = useStuckOnScroll();

  // Filter by category, then by the free-text query, then pin featured providers
  // to the front. Grouping preserves this order within each section.
  const filtered = useMemo(
    () =>
      orderFeaturedFirst(
        searchProviders(filterByCategory(providers, category), query),
      ),
    [providers, category, query],
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

  // Secondary line: the live model count (bold, in the row) then a one-line
  // provider description. Every provider id resolves to a description; the count
  // comes from the hydrated catalog.
  const row = (provider: ProviderInfo) => (
    <ProviderRow
      key={provider.id}
      provider={provider}
      modelCount={providerModels(catalog, provider).length}
      description={providerDescription(provider.id)}
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
      {/* The search + category bar as ONE sticky unit pinned to the top of the
          shared scroll region, so the provider list passes cleanly BEHIND it.
          Mirrors the Models tab's `ModelsBrowser`: transparent at rest, fading
          in the frosted-glass `bg-popover` fill (blur masks the scrolling rows)
          only once pinned — same offset (`top-0`), z-index (`z-20`), rounding
          (`rounded-2xl`) and `shadow-none!` so the two tabs feel identical. */}
      <div
        className={cn(
          "sticky top-0 z-20 transition-colors",
          stuck ? "rounded-2xl bg-popover shadow-none!" : "",
        )}
      >
        <div className="pt-1 pb-3">
          <ProviderFilters
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
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
 * Placeholder list shown while the first provider-status probe is in flight.
 * Muted, pulsing rows — enough to hold the layout without implying any connect
 * state before we actually know it.
 */
function ProviderListSkeleton({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="divide-y divide-border">
      {Array.from({ length: count }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static placeholder list, no reordering.
          key={i}
          className="flex items-center gap-3 px-4 py-3"
        >
          <div className="size-6 animate-pulse rounded-md bg-accent" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-28 animate-pulse rounded bg-accent" />
            <div className="h-3 w-40 animate-pulse rounded bg-accent" />
          </div>
          <div className="h-8 w-20 animate-pulse rounded-full bg-accent" />
        </div>
      ))}
    </div>
  );
}
