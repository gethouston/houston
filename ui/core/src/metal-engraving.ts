/** The space the contours are drawn in: the badge header's own proportions,
 *  with overscan above and below so any crop of it is filled. */
export const METAL_ENGRAVING_VIEWBOX = { width: 360, height: 160 } as const;

const LINES = 64;
const LINE_SPACING = 5;
const OVERSCAN = 80;
const POINTS = 25;
const POINT_STEP = 15;

/**
 * FNV-1a over the parts, so an engraving is stable across sessions and
 * distinct per input. Parts are joined by a NUL, so ("ab", "c") and
 * ("a", "bc") engrave differently.
 */
export function metalEngravingSeed(...parts: string[]): number {
  let hash = 2166136261;
  for (const char of parts.join("\0")) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  }
  return hash >>> 0;
}

/** One compound path in {@link METAL_ENGRAVING_VIEWBOX}. */
export function metalEngravingPath(seed: number): string {
  const phase = (seed % 360) * (Math.PI / 180);
  const bend = 18 + ((seed >>> 8) % 18);
  const lines: string[] = [];
  for (let line = 0; line < LINES; line += 1) {
    const base = line * LINE_SPACING - OVERSCAN;
    const points = Array.from({ length: POINTS }, (_, point) => {
      const x = point * POINT_STEP;
      const y =
        base +
        Math.sin(x / 76 + phase) * bend +
        Math.sin(x / 137 - phase + base / 110) * 14;
      return `${point === 0 ? "M" : "L"}${x},${y.toFixed(2)}`;
    });
    lines.push(points.join(" "));
  }
  return lines.join(" ");
}
