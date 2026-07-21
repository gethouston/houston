import type { DayBar } from "@/lib/analytics-model";

export interface InstallsBarsProps {
  bars: DayBar[];
}

/**
 * A minimal, presentational install bar chart: one column per day, height scaled
 * to the busiest day in the window. Pure (fed by `toDayBars`), token-colored, and
 * accessible — each bar carries a title with its day and count, and the series has
 * an aria label. Renders an empty note when the window has no installs.
 */
export function InstallsBars({ bars }: InstallsBarsProps) {
  if (bars.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No installs in this range yet.
      </p>
    );
  }
  const total = bars.reduce((sum, bar) => sum + bar.installs, 0);
  return (
    <div
      role="img"
      aria-label={`Installs per day: ${total} in the last ${bars.length} active days`}
      className="flex h-40 items-end gap-1"
    >
      {bars.map((bar) => (
        <div
          key={bar.day}
          title={`${bar.day}: ${bar.installs}`}
          className="flex-1 rounded-t bg-primary/80 transition-colors hover:bg-primary"
          style={{ height: `${Math.max(bar.fraction * 100, 2)}%` }}
        />
      ))}
    </div>
  );
}
