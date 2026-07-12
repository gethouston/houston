/**
 * Shared presentational primitives for the portable share/import wizards.
 * Visual language follows `knowledge-base/design-system.md` — near-black text
 * on white, no decorative icons, sentence-case sections, progress dots beside
 * the eyebrow (the close button owns the right corner).
 */

import { cn, Switch } from "@houston-ai/core";
import type React from "react";

export function WizardHeader({
  eyebrow,
  index,
  total,
}: {
  eyebrow: string;
  index: number;
  total: number;
}) {
  // Eyebrow + dots both pinned to the LEFT so radix's absolute-positioned
  // close button (`top-4 right-4`) keeps its own column.
  return (
    <header className="shrink-0 px-8 pt-6 pb-2 flex items-center gap-4">
      <p className="text-xs text-muted-foreground">{eyebrow}</p>
      <ProgressDots index={index} total={total} />
    </header>
  );
}

export function ProgressDots({
  index,
  total,
}: {
  index: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional counters — no identity field exists; order is invariant
          key={`dot-${i}`}
          className={cn(
            "size-2 rounded-full transition-colors",
            i < index && "bg-foreground/60",
            i === index && "bg-foreground",
            i > index && "bg-foreground/15",
          )}
        />
      ))}
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium mb-3">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export function Subtle({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function SwitchRow({
  checked,
  onChange,
  title,
  subtitle,
  trailing,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 px-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {trailing && <div className="shrink-0 mt-0.5">{trailing}</div>}
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

export function ChoiceCard({
  selected,
  onClick,
  title,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-background p-4 text-left transition-all",
        "border-foreground/5 hover:border-foreground/15 hover:shadow-[0_1px_0_rgba(0,0,0,0.05)]",
        selected && "border-foreground shadow-[0_1px_0_rgba(0,0,0,0.05)]",
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </button>
  );
}

export function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function humanize(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
