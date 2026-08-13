import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

/**
 * The app's neutral pill: a subtle surface, a hairline, one short line of
 * muted text.
 *
 * The shape any surface reaches for when it has a small FACT to state beside a
 * name — a model's spec in the AI Hub, the experience a chapter banked in the
 * Academy — so one kind of count never wears two different shapes on two
 * screens. Presentational and props-only: the words arrive already translated,
 * and the accent is never spent here, because a chip that lights is a status
 * (`StatusBadge`), not a fact.
 */
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
