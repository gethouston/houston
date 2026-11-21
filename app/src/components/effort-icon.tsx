import { EFFORT_ICON_VIEWBOX, effortBars } from "../lib/effort-bars";

interface EffortIconProps {
  levels: readonly string[];
  active?: string | null;
  className?: string;
}

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
