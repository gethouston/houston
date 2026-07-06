import { cn } from "../../utils";
import { PRICE_TIER_DOLLARS, PRICE_TIER_VAR } from "./format";
import type { ModelPriceTier } from "./types";

/**
 * Compact price signal for a row: `FREE` for the free tier, otherwise up to
 * three `$` where the filled ones carry the tier color and the rest are ghosted.
 * Exact per-Mtok pricing lives only in the detail panel (product decision).
 */
export function PriceGlyph({
  tier,
  freeLabel,
  className,
}: {
  tier: ModelPriceTier | undefined;
  freeLabel: string;
  className?: string;
}) {
  if (!tier) return null;
  const color = PRICE_TIER_VAR[tier];
  if (tier === "free") {
    return (
      <span
        className={cn("font-mono text-xs font-bold tracking-tight", className)}
        style={{ color }}
      >
        {freeLabel}
      </span>
    );
  }
  const filled = PRICE_TIER_DOLLARS[tier];
  return (
    <span
      className={cn(
        "font-mono text-xs font-bold tracking-tight tabular-nums",
        className,
      )}
    >
      <span style={{ color }}>{"$".repeat(filled)}</span>
      <span className="text-muted-foreground/40">{"$".repeat(3 - filled)}</span>
    </span>
  );
}
