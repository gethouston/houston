/**
 * Geometry + fill state for the reasoning-effort signal-bars icon. Pure so bar
 * math is unit-tested without a DOM.
 */

/** Square viewBox the bars are laid out in, bottom-aligned. */
export const EFFORT_ICON_VIEWBOX = 24;

const BASELINE = 21;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 19;
const BAR_WIDTH = 3;
const BAR_GAP = 1.6;

export interface EffortBar {
  /** Left edge in viewBox units. */
  x: number;
  /** Top edge in viewBox units; bars share a fixed bottom baseline. */
  y: number;
  width: number;
  height: number;
  /** True when this bar is at or below the active level. */
  filled: boolean;
}

/**
 * 1-based position of `active` within `levels`, i.e. how many bars are solid.
 * Returns 0 when `active` is unset or absent from this model's level set.
 */
export function effortFillCount(
  levels: readonly string[],
  active: string | null | undefined,
): number {
  if (!active) return 0;
  const index = levels.indexOf(active);
  return index < 0 ? 0 : index + 1;
}

/**
 * Ascending bar specs for `levels`, with the active prefix marked solid. The
 * group is horizontally centered for both 4-level and 5-level models.
 */
export function effortBars(
  levels: readonly string[],
  active: string | null | undefined,
): EffortBar[] {
  const count = levels.length;
  if (count === 0) return [];
  const filled = effortFillCount(levels, active);
  const totalWidth = count * BAR_WIDTH + (count - 1) * BAR_GAP;
  const startX = (EFFORT_ICON_VIEWBOX - totalWidth) / 2;
  const step = count > 1 ? (MAX_HEIGHT - MIN_HEIGHT) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => {
    const height = MIN_HEIGHT + i * step;
    return {
      x: startX + i * (BAR_WIDTH + BAR_GAP),
      y: BASELINE - height,
      width: BAR_WIDTH,
      height,
      filled: i < filled,
    };
  });
}
