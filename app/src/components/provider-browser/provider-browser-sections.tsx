/**
 * Presentational scaffolding for the {@link ProviderBrowser} grid: the titled
 * section wrapper, the empty-state placeholder, the loading skeleton, the
 * section-header row, and the shared per-provider card renderer. Kept in their
 * own file so `provider-browser.tsx` stays focused on the composition + display
 * decisions (and both stay under the 200-line limit). The sub-components are
 * props-only; labels arrive already translated.
 */

import { Button } from "@houston-ai/core";
import type { ReactNode } from "react";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import {
  providerCostLine,
  providerDescription,
} from "../../lib/provider-overrides";
import type { ProviderInfo } from "../../lib/providers";
import { groupByAuthType, providerModels } from "./provider-grouping";
import { ProviderRow } from "./provider-row";

/**
 * Build the `(provider) => <ProviderRow>` closure both the curated Sections and
 * the Connected / Available lists render every card through, capturing the live
 * connect machinery + catalog once. Card secondary line: bold live model count,
 * then the friendly cost prose, falling back to the provider description for
 * uncurated providers with no cost. Extracted here so the browser stays under the
 * 200-line limit.
 */
export function makeProviderRow({
  connections,
  catalog,
}: {
  connections: ProviderConnections;
  catalog: HubCatalog | undefined;
}): (provider: ProviderInfo) => ReactNode {
  return (provider) => (
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
      onConnect={connections.connect}
      onCancel={connections.cancel}
      onSignOut={connections.signOut}
    />
  );
}

/** A section title row with a label and an optional mono count. */
export function SectionHeader({
  label,
  count,
}: {
  label: string;
  count?: number;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {count != null ? (
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          {count}
        </span>
      ) : null}
    </div>
  );
}

/** A titled 2-column grid of cards. Hidden when it has no children. */
export function Section({
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

/**
 * The curated-mode body: two connect-type Sections (Subscription first, then
 * API key) built from {@link groupByAuthType}, plus a soft "see all" chip while
 * the list is collapsed and more providers remain hidden. Each provider still
 * renders through the browser's shared `row` closure, so its connected /
 * connecting / signing-out state shows on the card regardless of section — no
 * separate Connected group is needed here. Labels arrive already translated.
 */
export function CuratedProviderSections({
  providers,
  row,
  expanded,
  hasMore,
  onExpand,
  labels,
}: {
  providers: readonly ProviderInfo[];
  row: (provider: ProviderInfo) => ReactNode;
  expanded: boolean;
  hasMore: boolean;
  onExpand: () => void;
  labels: { subscription: string; apiKey: string; seeAll: string };
}) {
  const { subscription, apiKey } = groupByAuthType(providers);
  return (
    <div className="flex flex-col gap-8">
      <Section label={labels.subscription} count={subscription.length}>
        {subscription.map(row)}
      </Section>
      <Section label={labels.apiKey} count={apiKey.length}>
        {apiKey.map(row)}
      </Section>
      {!expanded && hasMore ? (
        <Button variant="secondary" className="self-start" onClick={onExpand}>
          {labels.seeAll}
        </Button>
      ) : null}
    </div>
  );
}

/** A calm placeholder when the search / quick filter matches no provider. */
export function ProviderEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="ht-hairline flex flex-col items-center gap-1 rounded-2xl bg-chip px-6 py-16 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      <p className="text-[13px] text-ink-muted">{description}</p>
    </div>
  );
}

/**
 * Placeholder grid shown while the first provider-status probe is in flight.
 * Muted, pulsing CARDS matching the real geometry — enough to hold the layout
 * without implying any connect state before we actually know it.
 */
export function ProviderBrowserSkeleton({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static placeholder grid, no reordering.
          key={i}
          className="flex items-center gap-3 rounded-xl bg-chip px-3 py-2.5"
        >
          <div className="size-8 shrink-0 animate-pulse rounded-lg bg-hover" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-hover" />
            <div className="h-2.5 w-32 animate-pulse rounded bg-hover" />
          </div>
          <div className="h-8 w-[92px] shrink-0 animate-pulse rounded-full bg-hover" />
        </div>
      ))}
    </div>
  );
}
