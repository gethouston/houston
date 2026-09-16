/**
 * Shared presentational primitives for the portable import and copy-agent
 * wizards. Visual language follows `/DESIGN.md` — semantic ink tokens, no
 * decorative icons, sentence-case sections.
 *
 * `ProgressDots` is what the flows hand to `FlowSheet`'s centred header slot,
 * so it carries no margins of its own.
 */

import { cn, Switch } from "@houston-ai/core";
import type React from "react";

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
            i < index && "bg-ink/60",
            i === index && "bg-ink",
            i > index && "bg-ink/15",
          )}
        />
      ))}
    </div>
  );
}

export function SwitchRow({
  checked,
  onChange,
  title,
  subtitle,
  trailing,
  flaggedNote,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  /** Shown under a row the threat scan flagged. */
  flaggedNote?: string | null;
}) {
  return (
    <div className="flex items-start gap-4 px-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{title}</p>
        {subtitle && (
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
            {subtitle}
          </p>
        )}
        {flaggedNote && (
          <p className="mt-1 text-xs text-ink-muted">{flaggedNote}</p>
        )}
      </div>
      {trailing && <div className="shrink-0 mt-0.5">{trailing}</div>}
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={title}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

export function humanize(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
