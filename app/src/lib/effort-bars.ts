/**
 * Geometry + fill state for the reasoning-effort "signal bars" icon
 * ({@link EffortIcon}). Pure so the bar math is unit-tested without a DOM — the
 * .tsx component is a thin `<rect>` map over {@link effortBars}.
 *
 * One ascending bar per level the active model accepts, solid up to (and
 * including) the current level and dimmed beyond it, so the glyph itself
 * encodes the effort. Bar count tracks the model's own level set (up to the
 * four-tier low→xhigh spectrum), keeping the provider > model > effort cascade
 * legible at a glance.
 */

/** Square viewBox the bars are laid out in (bottom-aligned). */
export const EFFORT_ICON_VIEWBOX = 24;

const BASELINE = 21;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 19;
const BAR_WIDTH = 3;
const BAR_GAP = 1.6;

export interface EffortBar {
  /** Left edge (viewBox units). */
  x: number;
  /** Top edge (viewBox units); bars share a fixed bottom baseline. */
  y: number;
  width: number;
  height: number;
  /** True when this bar is at or below the active level (drawn solid). */
  filled: boolean;
}

/**
 * 1-based position of `active` within `levels` (ordered low→high), i.e. how
 * many bars are solid. 0 when `active` is unset or not a member, so the icon
 * reads "nothing selected" rather than guessing a level.
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
 * Ascending bar specs for `levels`, the first {@link effortFillCount} of them
 * solid. The group is centered horizontally in the viewBox so the icon stays
 * balanced whether the model offers 4 levels or 5.
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
