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
      connection={connections.connectionState(provider)}
      connecting={connections.busy[provider.id] === "connecting"}
      signingOut={connections.busy[provider.id] === "signingOut"}
      onConnect={connections.connect}
      onCancel={connections.cancel}
      onSignOut={connections.signOut}
    />
  );
}

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
