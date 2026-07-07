/**
 * The AI Models hub's colorful brand mark — its "candy store" counterpart to the
 * Integrations tab's `AppLogo`. It renders the shared monochrome `ProviderGlyph`
 * boxless (no tile, no backing wash) and, when the brand has a curated accent,
 * tints the glyph via inherited `currentColor`. Chat surfaces (RowCard etc.)
 * intentionally stay monochrome by using `ProviderGlyph` directly; only the hub
 * reaches for this full-color treatment.
 */

import { cn } from "@houston-ai/core";
import { providerBrandColor } from "../shell/provider-brand-colors.ts";
import { ProviderGlyph } from "../shell/provider-logos.tsx";

// Full-bleed like the Integrations tab's `AppLogo` images — the glyph fills the
// footprint so the brand mark reads big and bold, not shrunken inside a box.
const MARK_SIZE = {
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
} as const;

/**
 * A colorful brand mark for a provider id. `aria-hidden` since adjacent text
 * carries the provider name. With a curated accent the glyph renders in the
 * brand color; without one it falls back to `text-foreground` (the deliberate
 * look for black-brand marks and the monogram fallback).
 */
export function BrandMark({
  providerId,
  size = "md",
  className,
}: {
  providerId: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const color = providerBrandColor(providerId);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center",
        MARK_SIZE[size],
        !color && "text-foreground",
        className,
      )}
      style={color ? { color } : undefined}
    >
      <span className="inline-grid size-full place-items-center [&_svg]:size-full">
        <ProviderGlyph providerId={providerId} />
      </span>
    </span>
  );
}
