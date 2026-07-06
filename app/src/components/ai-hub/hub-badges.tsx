/**
 * The shared chip + label kit for the AI Hub redesign. `SpecChip` is the base
 * neutral pill (subtle surface + hairline); every other chip composes it. All
 * primitives are presentational and props-only: labels arrive already
 * translated (parents own i18n), colour comes only from token classes, and the
 * accent stays reserved for the connected/live state (`LiveStatus`). No hard
 * coded hex, no `useTranslation` here.
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

const MARK_SIZE = {
  sm: "size-5",
  md: "size-6",
  lg: "size-8",
} as const;

/**
 * A boxless brand mark: a lab/model glyph (a `ProviderGlyph` or lucide icon)
 * rendered inline as a logo, with NO container box, background, or hairline.
 * `size` drives the glyph itself — the wrapper forces the child svg to fill it
 * (`[&_svg]:size-full`) since `ProviderGlyph` draws at a fixed intrinsic size.
 */
export function ModelMark({
  mark,
  size = "md",
}: {
  mark: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center [&_svg]:size-full",
        MARK_SIZE[size],
      )}
    >
      {mark}
    </span>
  );
}
