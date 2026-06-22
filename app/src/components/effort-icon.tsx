import { effortBars, EFFORT_ICON_VIEWBOX } from "../lib/effort-bars";

interface EffortIconProps {
  /** Levels the active model accepts, ordered low -> high. One bar each. */
  levels: readonly string[];
  /** Current level; bars fill up to and including it. */
  active?: string | null;
  className?: string;
}

/**
 * Reasoning-effort glyph: ascending signal bars filled to the active level.
 * Color is inherited via `currentColor`; unfilled bars stay visible at low
 * opacity instead of disappearing.
 */
export function EffortIcon({ levels, active, className }: EffortIconProps) {
  const bars = effortBars(levels, active);
  return (
    <svg
      viewBox={`0 0 ${EFFORT_ICON_VIEWBOX} ${EFFORT_ICON_VIEWBOX}`}
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {bars.map((bar, i) => (
        <rect
          key={levels[i]}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx={1}
          fill="currentColor"
          fillOpacity={bar.filled ? 1 : 0.3}
        />
      ))}
    </svg>
  );
}
