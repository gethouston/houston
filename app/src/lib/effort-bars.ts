export const EFFORT_ICON_VIEWBOX = 24;

const BASELINE = 21;
const MIN_HEIGHT = 5;
const MAX_HEIGHT = 19;
const BAR_WIDTH = 3;
const BAR_GAP = 1.6;

export interface EffortBar {
  x: number;
  y: number;
  width: number;
  height: number;
  filled: boolean;
}

export function effortFillCount(
  levels: readonly string[],
  active: string | null | undefined,
): number {
  if (!active) return 0;
  const index = levels.indexOf(active);
  return index < 0 ? 0 : index + 1;
}

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
