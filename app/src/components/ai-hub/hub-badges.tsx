/**
 * The shared chip + label kit for the AI Hub redesign. `SpecChip` is the base
 * neutral pill (subtle surface + hairline); every other chip composes it and
 * stays token-only, with the accent reserved for the connected/live state
 * (`LiveStatus`); brand colour is NOT a chip concern — it arrives via the
 * `BrandMark` tile (`brand-mark.tsx`). All primitives are presentational and
 * props-only: labels arrive already translated (parents own i18n). No hard
 * coded hex, no `useTranslation` here.
 */

import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { StatusDot } from "../integrations/connection-status-badge";

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
        "ht-hairline inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
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
    <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
      {text}
    </span>
  );
}

/**
 * The only always-green element: a live dot + label for connected state.
 * Same primitive + proportions as the Integrations tab's `ConnectionStatusBadge`
 * (`StatusDot` + `text-xs`) so "connected" reads identically everywhere in the
 * app, not just here.
 */
export function LiveStatus({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
      <StatusDot status="active" />
      {label}
    </span>
  );
}
