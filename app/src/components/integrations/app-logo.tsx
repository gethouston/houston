import { cn } from "@houston-ai/core";
import { useState } from "react";
import type { AppDisplay } from "./app-display";

const SIZES = {
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
  xl: "size-14",
} as const;

// The initial-letter fallback scales with the box so the hero-size (xl) plate
// never shows a tiny letter lost in the middle; the smaller rows keep text-xs.
const LETTER_SIZE = {
  sm: "text-xs",
  md: "text-xs",
  lg: "text-xs",
  xl: "text-lg",
} as const;

/**
 * The ONE app-logo component, shared by every integrations surface (tab, sheet,
 * catalog rows) AND the in-chat connect cards. Span-based so it nests validly
 * inside inline chat prose (the RowCard badge lives inside a <p>), while the
 * flex classes render identically in block contexts.
 *
 * States: the brand image renders BARE (its own art carries the brand — no
 * plate, no border, so it integrates into whatever surface hosts it); the
 * initial-letter fallback (no URL, or the image failed) keeps a soft
 * `bg-background` plate so the letter reads as a deliberate avatar. The box is
 * a fixed size in every state, so swapping never shifts surrounding layout.
 *
 * The failure latch is keyed to the URL that actually failed: a card that
 * mounts before the toolkits catalog resolves (the in-chat connect step) shows
 * the letter for its interim state, then AUTOMATICALLY retries when the real
 * catalog `logoUrl` arrives. A boolean latch here once ate the production
 * logos: the pre-catalog favicon guess 404'd, latched, and the real Composio
 * logo landing moments later was never rendered.
 */
export function AppLogo({
  display,
  size = "md",
  className,
}: {
  display: AppDisplay;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = cn(SIZES[size], "shrink-0 rounded-lg", className);

  if (!display.logoUrl || failedUrl === display.logoUrl) {
    return (
      <span
        className={cn(box, "flex items-center justify-center bg-background")}
      >
        <span
          className={cn(
            "font-semibold text-muted-foreground",
            LETTER_SIZE[size],
          )}
        >
          {display.name.charAt(0).toUpperCase()}
        </span>
      </span>
    );
  }
  return (
    <img
      src={display.logoUrl}
      alt={display.name}
      className={cn(box, "object-contain")}
      onError={() => setFailedUrl(display.logoUrl)}
    />
  );
}
