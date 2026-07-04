import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import type { ComingSoonProviderInfo, ProviderInfo } from "../../lib/providers";
import { ComingSoonProviderCard, ProviderCard } from "./provider-card";
import { groupProviders, providerModelCount } from "./provider-grouping";

const ENTER = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
};

interface ProviderGridProps {
  providers: readonly ProviderInfo[];
  comingSoon: readonly ComingSoonProviderInfo[];
  connections: ProviderConnections;
  catalog: HubCatalog;
  onOpen: (provider: ProviderInfo) => void;
}

/** A titled grid of animated cards. Hidden when it has no children. */
function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode[];
}) {
  if (children.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">{children}</AnimatePresence>
      </div>
    </section>
  );
}

/**
 * The provider marketplace: Connected cards first, then Available, then a
 * muted Coming soon row. Cards animate in on mount and re-flow (popLayout)
 * when a connect flips a provider between the first two groups. Model counts
 * come from the catalog, unioned across each card's gateway ids.
 */
export function ProviderGrid({
  providers,
  comingSoon,
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
    <motion.div key={provider.id} layout {...ENTER}>
      <ProviderCard
        provider={provider}
        connected={connections.isConnected(provider)}
        busyState={connections.busy[provider.id]}
        modelCount={providerModelCount(catalog, provider)}
        onOpen={() => onOpen(provider)}
        onConnect={() => connections.connect(provider)}
        onCancel={() => void connections.cancel(provider)}
      />
    </motion.div>
  );

  return (
    <div className="flex flex-col gap-8">
      <Section title={t("sections.connected")}>{connected.map(card)}</Section>
      <Section title={t("sections.available")}>{available.map(card)}</Section>
      <Section title={t("sections.comingSoon")}>
        {comingSoon.map((provider) => (
          <motion.div key={provider.id} layout {...ENTER}>
            <ComingSoonProviderCard provider={provider} />
          </motion.div>
        ))}
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
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static placeholder list, no reordering.
          key={i}
          className="flex flex-col rounded-2xl border border-black/5 bg-card p-5"
        >
          <div className="size-10 animate-pulse rounded-xl bg-secondary" />
          <div className="mt-3 h-4 w-24 animate-pulse rounded bg-secondary" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="mt-4 h-9 w-24 animate-pulse rounded-full bg-secondary" />
        </div>
      ))}
    </div>
  );
}
