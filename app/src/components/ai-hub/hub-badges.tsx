/**
 * The shared chip + label kit for the AI Hub redesign. `SpecChip` is the base
 * neutral pill (subtle surface + hairline); every other chip composes it. All
 * primitives are presentational and props-only: labels arrive already
 * translated (parents own i18n). The chips themselves stay token-only, with the
 * accent reserved for the connected/live state (`LiveStatus`); brand colour is
 * NOT a chip concern — it arrives via the `BrandMark` tile (`brand-mark.tsx`).
 * No hard coded hex, no `useTranslation` here.
 */

import { cn } from "@houston-ai/core";
import { CreditCard, KeyRound, Monitor } from "lucide-react";
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
        "ht-hairline inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

const AUTH_ICON = {
  subscription: CreditCard,
  apiKey: KeyRound,
  local: Monitor,
} as const;

/** How a provider is paid for: a neutral chip with an icon + caller's label. */
export function AuthBadge({
  kind,
  label,
}: {
  kind: "subscription" | "apiKey" | "local";
  label: string;
}) {
  const Icon = AUTH_ICON[kind];
  return (
    <SpecChip>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </SpecChip>
  );
}

/** A friendly "good at ..." capability, rendered as a neutral chip. */
export function CapabilityChip({ label }: { label: string }) {
  return <SpecChip>{label}</SpecChip>;
}

/** Budget -> premium as three dots. Filled = spend; neutral, never accent. */
export function CostMeter({
  tier,
  title,
}: {
  tier: 1 | 2 | 3;
  title?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={title}
    >
      {[1, 2, 3].map((dot) => (
        <span
          key={dot}
          className={cn(
            "size-1.5 rounded-full",
            dot <= tier ? "bg-foreground/70" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

/** A plain-language memory readout, e.g. "Long" + a muted mono value. */
export function MemoryLabel({ word, value }: { word: string; value: string }) {
  return (
    <span className="inline-flex items-baseline">
      <span className="text-[13px] font-medium text-foreground">{word}</span>
      <span className="ml-1.5 font-mono text-xs text-muted-foreground tabular-nums">
        {value}
      </span>
    </span>
  );
}

/** Pre-formatted price text, e.g. "from $3" or "$5.00 / $25.00". */
export function PriceText({ text }: { text: string }) {
  return (
    <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
      {text}
    </span>
  );
}

/** The only always-green element: a live dot + label for connected state. */
export function LiveStatus({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-1.5 rounded-full bg-success ring-2 ring-success/25"
        aria-hidden="true"
      />
      <span className="text-[12.5px] font-medium text-success">{label}</span>
    </span>
  );
}
