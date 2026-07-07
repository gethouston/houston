/**
 * Presentational scaffolding for the {@link ProviderBrowser} grid: the titled
 * section wrapper, the empty-state placeholder, the loading skeleton, and the
 * section-header row. Kept in their own file so `provider-browser.tsx` stays
 * focused on the composition + connect wiring (and both stay under the
 * 200-line limit). All props-only; labels arrive already translated.
 */

import type { ReactNode } from "react";

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
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      {count != null ? (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
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

/** A calm placeholder when the search / quick filter matches no provider. */
export function ProviderEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="ht-hairline flex flex-col items-center gap-1 rounded-2xl bg-secondary px-6 py-16 text-center">
      <p className="text-[15px] font-medium text-foreground">{title}</p>
      <p className="text-[13px] text-muted-foreground">{description}</p>
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
