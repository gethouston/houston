import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

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
