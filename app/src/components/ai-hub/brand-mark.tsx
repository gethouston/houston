/**
 * The AI Models hub's colorful brand tile — its "candy store" counterpart to the
 * Integrations tab's `AppLogo`. It wraps the shared monochrome `ProviderGlyph` in
 * a rounded tile and, when the brand has a curated accent, tints both the glyph
 * (via inherited `currentColor`) and a translucent backing wash. Chat surfaces
 * (RowCard etc.) intentionally stay monochrome by using `ProviderGlyph` directly;
 * only the hub reaches for this full-color treatment.
 */

import { cn } from "@houston-ai/core";
import { providerBrandColor } from "../shell/provider-brand-colors.ts";
import { ProviderGlyph } from "../shell/provider-logos.tsx";

const TILE_SIZE = {
  sm: "size-6 p-1",
  md: "size-8 p-1.5",
  lg: "size-10 p-2",
} as const;

/**
 * A brand tile for a provider id. `aria-hidden` since adjacent text carries the
 * provider name. With a curated accent the tile colors the glyph and a 14% wash
 * of the same hue — a `color-mix` tint that reads on both light and dark parents.
 * Without one it falls back to neutral token classes (a faint foreground wash).
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
        "inline-grid shrink-0 place-items-center rounded-lg",
        TILE_SIZE[size],
        !color && "bg-foreground/[0.06] text-foreground",
        className,
      )}
      style={
        color
          ? {
              color,
              backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
            }
          : undefined
      }
    >
      <span className="inline-grid size-full place-items-center [&_svg]:size-full">
        <ProviderGlyph providerId={providerId} />
      </span>
    </span>
  );
}
