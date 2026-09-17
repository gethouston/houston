import { Skeleton } from "@houston-ai/core";
import {
  type OrgChartUsageState,
  orgChartBarPercent,
} from "./org-chart-view-model";

/**
 * The two usage cells of the org chart — the count beside a name and the bar
 * under an agent — in one place, so a person's number and an agent's number
 * can never end up in two different type scales.
 *
 * Both render a skeleton of their own size while usage loads, so the chart
 * never reflows when the numbers land, and both vanish entirely when there is
 * no usage to show (a caller without the right to read it, or a failed read
 * the caption already reports). The window they count is named ONCE, in that
 * caption, which is what lets each cell stay a bare numeral.
 */

export function UsageCount({
  state,
  messages,
}: {
  state: OrgChartUsageState;
  messages: number;
}) {
  if (state === "hidden" || state === "error") return null;
  if (state === "loading")
    return <Skeleton className="h-3 w-6 shrink-0 rounded-full" />;
  return (
    <span className="shrink-0 text-xs text-ink-muted tabular-nums">
      {messages}
    </span>
  );
}

export function UsageBar({
  state,
  messages,
  scale,
}: {
  state: OrgChartUsageState;
  messages: number;
  /** The busiest agent in the whole chart, from `orgChartScale`. */
  scale: number;
}) {
  if (state === "hidden" || state === "error") return null;
  if (state === "loading")
    return <Skeleton className="mt-1.5 h-2 w-full rounded-full" />;
  return (
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-chip">
      <div
        className="h-full rounded-full bg-action"
        style={{ width: `${orgChartBarPercent(messages, scale)}%` }}
      />
    </div>
  );
}
