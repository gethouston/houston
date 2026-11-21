import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

export function PlanBriefingCta({
  label,
  disabled = false,
  onClick,
}: {
  label: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="plan-briefing-cta plan-briefing-press flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-base font-medium text-balance text-dialog outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
    >
      {label}
    </button>
  );
}

export function PlanBriefingQuietButton({
  onClick,
  disabled = false,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "plan-briefing-quiet plan-briefing-press mt-4 self-center rounded-full px-4 py-2 text-sm text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}
