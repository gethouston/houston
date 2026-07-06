import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import type { ProviderInfo } from "../../lib/providers";
import { SectionHeader } from "./hub-badges";
import { ProviderCard } from "./provider-card";
import {
  filterByCategory,
  orderFeaturedFirst,
  type ProviderCategoryFilter,
  searchProviders,
} from "./provider-filtering";
import { ProviderFilters } from "./provider-filters";
import { groupProviders } from "./provider-grouping";

interface ProviderGridProps {
  providers: readonly ProviderInfo[];
  connections: ProviderConnections;
  catalog: HubCatalog;
  onOpen: (provider: ProviderInfo) => void;
}

/** A titled grid of cards. Hidden when it has no children. */
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
    <section className="flex flex-col gap-3">
      <SectionHeader label={label} count={count} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
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
 * The provider marketplace: a search + category filter bar, then Connected cards
 * (featured providers pinned first) followed by Available. Cards render
 * statically — no `layout` animation — so the grid never reflows or resizes when
 * a modal opens and the scroll-lock changes the content width. The tab crossfade
 * in the parent view supplies the only entrance motion; a connect that flips a
 * provider between groups just re-renders.
 */
export function ProviderGrid({
  providers,
  connections,
  catalog,
  onOpen,
}: ProviderGridProps) {
  const { t } = useTranslation("aiHub");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProviderCategoryFilter>("all");

  // Filter by category, then by the free-text query, then pin featured providers
  // to the front — the hub's Providers tab ordering only (the chat picker is
  // untouched). Grouping preserves this order within each section.
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
    return <ProviderGridSkeleton count={providers.length || 6} />;
  }

  const { connected, available } = groupProviders(
    filtered,
    connections.isConnected,
  );

  const card = (provider: ProviderInfo) => (
    <ProviderCard
      key={provider.id}
      provider={provider}
      catalog={catalog}
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
    <div className="flex flex-col gap-6">
      <ProviderFilters
        query={query}
        setQuery={setQuery}
        category={category}
        setCategory={setCategory}
      />
      {filtered.length === 0 ? (
        <ProviderEmpty />
      ) : (
        <div className="flex flex-col gap-8">
          <Section label={t("sections.connected")} count={connected.length}>
            {connected.map(card)}
          </Section>
          <Section label={t("sections.available")} count={available.length}>
            {available.map(card)}
          </Section>
        </div>
      )}
    </div>
  );
}

/**
 * Placeholder grid shown while the first provider-status probe is in flight.
 * Muted, pulsing card shapes — enough to hold the layout without implying any
 * connect state before we actually know it.
 */
function ProviderGridSkeleton({ count }: { count: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static placeholder list, no reordering.
          key={i}
          className="ht-hairline flex flex-col rounded-2xl bg-secondary p-[18px]"
        >
          <div className="size-10 animate-pulse rounded-lg bg-accent" />
          <div className="mt-3 h-4 w-24 animate-pulse rounded bg-accent" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-accent" />
          <div className="mt-4 h-8 w-24 animate-pulse rounded-full bg-accent" />
        </div>
      ))}
    </div>
  );
}
