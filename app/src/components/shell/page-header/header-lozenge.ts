import { cn } from "@houston-ai/core";

export function headerLozengeTrack(className?: string) {
  return cn(
    "flex min-w-0 items-center gap-0.5 rounded-full bg-tab-track p-0.5",
    className,
  );
}

export function headerLozengeClasses(active: boolean, className?: string) {
  return cn(
    "flex min-w-0 shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] leading-5 font-weight-510 whitespace-nowrap transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
    active
      ? "bg-tab-active text-ink"
      : "text-ink-muted hover:bg-hover/60 hover:text-hover-text",
    className,
  );
}
