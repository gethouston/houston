"use client";

import { cn } from "../utils";
import {
  STATUS_DOT_CLASS,
  STATUS_TEXT_CLASS,
  type StatusKind,
} from "./status-badge-styles";

export type { StatusKind };

/**
 * A small colored status dot, sized for inline use next to an item name — the
 * sober "green thing beside the name" treatment (success/warning/danger per
 * status), never a tinted card background. The dot itself is decorative:
 * either pair it with a visible text label ({@link StatusBadge}) or pass
 * `srLabel` so screen readers still hear the status when the dot stands alone
 * (the presence-style "● Asana" catalog rows).
 */
export function StatusDot({
  status,
  srLabel,
  className,
}: {
  status: StatusKind;
  /** Visually-hidden status text for dot-only placements. */
  srLabel?: string;
  className?: string;
}) {
  const dot = (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        STATUS_DOT_CLASS[status],
        className,
      )}
    />
  );
  if (!srLabel) return dot;
  return (
    <>
      {dot}
      <span className="sr-only">{srLabel}</span>
    </>
  );
}

/**
 * A colored {@link StatusDot} + a colored label describing a connection's live
 * status. Props-only and i18n-agnostic: the consumer passes the already
 * translated `label` so `ui/` stays language-agnostic. The single source of the
 * "connected"/"pending"/"error" indicator reused across catalog rows, the
 * integrations hub, and the AI models hub so it reads identically everywhere.
 */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: StatusKind;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        STATUS_TEXT_CLASS[status],
        className,
      )}
    >
      <StatusDot status={status} />
      {label}
    </span>
  );
}
