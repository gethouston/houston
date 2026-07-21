import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import type { InstallBucket } from "./installs-model";

interface InstallsChartProps {
  buckets: InstallBucket[];
  /** Busiest bucket's installs (≥ 1), the full-height reference. */
  max: number;
  /** Tooltip + aria description ("Jul 12: 8 installs"). */
  barLabel: (bucket: InstallBucket) => string;
  /** Short x-axis label for a bucket's day ("Mon" / "Jul 12"). */
  axisLabel: (bucket: InstallBucket, index: number) => string;
  /**
   * Direct value printed above a bar, or null for none. The panel labels every
   * nonzero bar on the 7-day view and only the tallest on dense ranges —
   * selective labels keep the chart readable without a number on everything.
   */
  valueLabel: (bucket: InstallBucket, index: number) => string | null;
}

/**
 * Installs-per-day bars, one per bucket. Single series, so identity needs no
 * legend; comprehension comes from three layers — selective direct value
 * labels, a real tooltip per bar (hover enhances, never gates: every value is
 * also an aria-label), and the emphasized "today" axis label. Zero days stay
 * visible as a small tick so the range reads as "measured and idle", not
 * "missing". Bars top out below the frame so labels never clip. Tokens only.
 * The presentational twin of the Compute section's bar chart, minus the
 * live-now dot (installs have no running state).
 */
export function InstallsChart({
  buckets,
  max,
  barLabel,
  axisLabel,
  valueLabel,
}: InstallsChartProps) {
  return (
    <ol className="flex h-32 items-end gap-[3px]">
      {buckets.map((bucket, index) => {
        const last = index === buckets.length - 1;
        // 84% ceiling leaves headroom for the value label.
        const pct =
          bucket.installs === 0
            ? 0
            : Math.max(4, Math.round((bucket.installs / max) * 84));
        const label = barLabel(bucket);
        const value = valueLabel(bucket, index);
        return (
          <li
            key={bucket.day}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  role="img"
                  aria-label={label}
                  className="flex h-full flex-col items-center justify-end"
                >
                  {value !== null && (
                    <span
                      aria-hidden
                      className="mb-1 text-[10px] leading-none whitespace-nowrap text-ink-muted"
                    >
                      {value}
                    </span>
                  )}
                  {pct === 0 ? (
                    <div className="h-[3px] w-full max-w-9 rounded-full bg-chip" />
                  ) : (
                    <div
                      className="w-full max-w-9 rounded-t-[4px] bg-action/80 transition-[height] duration-300 hover:bg-action"
                      style={{ height: `${pct}%` }}
                    />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
            <span
              aria-hidden
              className={cn(
                // On dense ranges only every ~5th label renders (the tooltip
                // covers the rest), so an overflowing "Jun 26" has room to
                // spill over its hidden neighbors instead of clipping.
                "mt-1 self-center text-center text-[10px] leading-tight whitespace-nowrap",
                last ? "font-medium text-ink" : "text-ink-muted",
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
