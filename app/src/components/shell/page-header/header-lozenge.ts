import { cn } from "@houston-ai/core";

/**
 * The Safari tab, as one class list — and the TRACK the cluster sits in.
 *
 * Safari's grammar, deliberately: the tabs sit ON a quietly darker contained
 * track (`tab-track`), and only the OPEN one is painted — a white pill
 * (`tab-active`; an elevated gray in the dark theme, where white would
 * glare). The track is what holds the cluster together as one control, so
 * the tabs themselves carry no borders and no container of their own, and
 * everything is fully rounded — the pill's radius is half its height, never
 * a squared corner.
 *
 * Geometry: 20px line + 4 + 4 = a 28px pill, inside the track's 2px padding
 * = the same 32px the cluster has always stood in the fixed strip.
 */
export function headerLozengeTrack(className?: string) {
  return cn(
    "flex min-w-0 items-center gap-0.5 rounded-full bg-tab-track p-0.5",
    className,
  );
}

export function headerLozengeClasses(active: boolean, className?: string) {
  return cn(
    // Only fill and ink move, never layout: navigation repaints and shifts
    // nothing.
    "flex min-w-0 shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] leading-5 font-weight-510 whitespace-nowrap transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
    active
      ? "bg-tab-active text-ink"
      : "text-ink-muted hover:bg-hover/60 hover:text-hover-text",
    className,
  );
}
