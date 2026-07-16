import { cn } from "@houston-ai/core";
import type { ComputeBucket } from "./compute-usage-model";

interface ComputeBarChartProps {
  buckets: ComputeBucket[];
  /** Busiest bucket's runMs (≥ 1), the 100%-height reference. */
  max: number;
  /** True when some agent is running right now — dots the last bar. */
  runningNow: boolean;
  /** Accessible per-bar description ("Jul 12: ran 2h 05m, 8 tasks"). */
  barLabel: (bucket: ComputeBucket) => string;
  /** Short x-axis label for a bucket's start day ("Mon" / "Jul 12"). */
  axisLabel: (bucket: ComputeBucket, index: number) => string;
}

/**
 * Running-time bars, one per bucket (day or week). Single series, so identity
 * needs no legend or per-bar numbers — the section's summary line carries the
 * total, each bar carries its value as an aria-label and a native tooltip
 * (hover enhances, never gates). Zero days stay visible as a small tick so the
 * range reads as "measured and idle", not "missing". A pulse dot rides the
 * last bar while an agent is running — that bar is still growing. Tokens only.
 */
export function ComputeBarChart({
  buckets,
  max,
  runningNow,
  barLabel,
  axisLabel,
}: ComputeBarChartProps) {
  return (
    <ol className="flex h-28 items-end gap-[2px]">
      {buckets.map((bucket, index) => {
        const last = index === buckets.length - 1;
        const pct =
          bucket.runMs === 0
            ? 0
            : Math.max(4, Math.round((bucket.runMs / max) * 100));
        const label = barLabel(bucket);
        return (
          <li
            key={bucket.startDay}
            className="group flex h-full min-w-0 flex-1 flex-col justify-end"
          >
            <div
              role="img"
              aria-label={label}
              title={label}
              className="flex h-full flex-col items-center justify-end gap-1"
            >
              {last && runningNow && (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 animate-pulse rounded-full bg-action"
                />
              )}
              {pct === 0 ? (
                <div className="h-[3px] w-full max-w-9 rounded-full bg-chip" />
              ) : (
                <div
                  className="w-full max-w-9 rounded-t-[4px] bg-action/80 transition-[height] duration-300 group-hover:bg-action"
                  style={{ height: `${pct}%` }}
                />
              )}
            </div>
            <span
              aria-hidden
              className={cn(
                // No truncation: on dense ranges only every ~5th label renders
                // (the tooltip covers the rest), so an overflowing "Jun 26" has
                // room to spill over its hidden neighbors instead of clipping.
                "mt-1 self-center text-center text-[10px] leading-tight whitespace-nowrap text-ink-muted",
                buckets.length > 14 && index % 5 !== 0 && !last && "invisible",
              )}
            >
              {axisLabel(bucket, index)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
