import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import type { ProviderInfo } from "../../lib/providers";
import { SectionHeader } from "./hub-badges";
import { ProviderCard } from "./provider-card";
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
  live,
  children,
}: {
  label: string;
  count: number;
  live?: boolean;
  children: ReactNode[];
}) {
  if (children.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader label={label} count={count} live={live} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

/**
 * The provider marketplace: Connected cards first (their header carries the live
 * dot), then Available. Cards render statically — no `layout` animation — so the
 * grid never reflows or resizes when a modal opens and the scroll-lock changes
 * the content width. The tab crossfade in the parent view supplies the only
 * entrance motion; a connect that flips a provider between groups just re-renders.
 */
export function ProviderGrid({
  providers,
  connections,
  catalog,
  onOpen,
}: ProviderGridProps) {
  const { t } = useTranslation("aiHub");

  // Until the first status probe resolves we don't know which providers are
  // connected, so a live Connect button would be the wrong state. Hold a quiet
  // skeleton in place instead of guessing.
  if (!connections.ready) {
    return <ProviderGridSkeleton count={providers.length || 6} />;
  }

  const { connected, available } = groupProviders(
    providers,
    connections.isConnected,
  );

  const card = (provider: ProviderInfo) => (
    <ProviderCard
      key={provider.id}
      provider={provider}
      catalog={catalog}
      connected={connections.isConnected(provider)}
      connecting={connections.busy[provider.id] === "connecting"}
      onOpen={onOpen}
      onConnect={connections.connect}
      onCancel={connections.cancel}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <Section label={t("sections.connected")} count={connected.length} live>
        {connected.map(card)}
      </Section>
      <Section label={t("sections.available")} count={available.length}>
        {available.map(card)}
      </Section>
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
