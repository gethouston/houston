/**
 * The shared chip + label kit for the AI Hub redesign. `SpecChip` is the base
 * neutral pill (subtle surface + hairline); every other chip composes it and
 * stays token-only, with the accent reserved for the connected/live state
 * (`LiveStatus`); brand colour is NOT a chip concern — it arrives via the
 * `BrandMark` tile (`brand-mark.tsx`). All primitives are presentational and
 * props-only: labels arrive already translated (parents own i18n). No hard
 * coded hex, no `useTranslation` here.
 */

import { cn, StatusBadge } from "@houston-ai/core";
import type { ReactNode } from "react";

/** Base neutral pill every hub chip is built from. */
export function SpecChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ht-hairline inline-flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium text-ink-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A friendly "good at ..." capability, rendered as a neutral chip. */
export function CapabilityChip({ label }: { label: string }) {
  return <SpecChip>{label}</SpecChip>;
}

/** Pre-formatted price text, e.g. "from $3" or "$5.00 / $25.00". */
export function PriceText({ text }: { text: string }) {
  return (
    <span className="font-mono text-[13px] text-ink-muted tabular-nums">
      {text}
    </span>
  );
}

/**
 * The only always-green element: a live dot + label for connected state. A thin
 * wrapper over the shared `ui/core` {@link StatusBadge} (`active`), so
 * "connected" reads identically everywhere in the app, not just here.
 */
export function LiveStatus({ label }: { label: string }) {
  return <StatusBadge status="active" label={label} />;
}
