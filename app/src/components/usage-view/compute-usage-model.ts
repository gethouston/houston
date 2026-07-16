import type { Capabilities, ComputeUsageRow } from "@houston-ai/engine-client";

/**
 * Pure aggregation for the Compute section (no DOM, no i18n): buckets the
 * gateway's per-(agent, UTC day) rows into the selected range and rolls up
 * per-agent totals. The user sees ONE time metric — running time = `awakeMs`
 * (the engine's up-time); `activeMs` is a recorded subset we deliberately do
 * not render, and tasks (`turns + routineRuns`) is the companion stat.
 */

export type ComputeRange = "week" | "month" | "quarter";

export interface ComputeBucket {
  /** First UTC day of the bucket (`YYYY-MM-DD`) — the bar's identity/label. */
  startDay: string;
  /** Days folded into this bucket (1 for daily ranges, 7 for weekly). */
  days: number;
  runMs: number;
  tasks: number;
}

export interface ComputeAgentTotals {
  agentSlug: string;
  runMs: number;
  tasks: number;
}

export interface ComputeModel {
  buckets: ComputeBucket[];
  perAgent: ComputeAgentTotals[];
  totalRunMs: number;
  totalTasks: number;
  /** Busiest bucket/agent, floored at 1 so bar math never divides by zero. */
  maxBucketMs: number;
  maxAgentMs: number;
}

const DAY_MS = 86_400_000;

const dayString = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Monday of the UTC week containing `ts` (ISO weeks, like the gateway's days). */
function weekStart(ts: number): number {
  const weekday = new Date(ts).getUTCDay(); // 0 = Sunday
  const sinceMonday = (weekday + 6) % 7;
  return Math.floor(ts / DAY_MS) * DAY_MS - sinceMonday * DAY_MS;
}

/** The range's bucket starts, oldest first, always ending at "now"'s bucket. */
function bucketStarts(range: ComputeRange, nowMs: number): number[] {
  if (range === "quarter") {
    const current = weekStart(nowMs);
    return Array.from(
      { length: 13 },
      (_, i) => current - (12 - i) * 7 * DAY_MS,
    );
  }
  const days = range === "week" ? 7 : 30;
  const today = Math.floor(nowMs / DAY_MS) * DAY_MS;
  return Array.from(
    { length: days },
    (_, i) => today - (days - 1 - i) * DAY_MS,
  );
}

export function bucketCompute(
  rows: readonly ComputeUsageRow[],
  range: ComputeRange,
  nowMs: number,
): ComputeModel {
  const starts = bucketStarts(range, nowMs);
  const bucketDays = range === "quarter" ? 7 : 1;
  const buckets: ComputeBucket[] = starts.map((start) => ({
    startDay: dayString(start),
    days: bucketDays,
    runMs: 0,
    tasks: 0,
  }));
  const first = starts[0];
  const spanMs = bucketDays * DAY_MS;
  const perAgent = new Map<string, ComputeAgentTotals>();

  for (const row of rows) {
    const ts = dayStart(row.day);
    if (Number.isNaN(ts) || ts < first) continue;
    const index = Math.floor((ts - first) / spanMs);
    // Rows dated past "now"'s bucket (clock skew) fold into the last bar
    // rather than vanishing — the server is the time authority, not us.
    const bucket = buckets[Math.min(index, buckets.length - 1)];
    const tasks = row.turns + row.routineRuns;
    bucket.runMs += row.awakeMs;
    bucket.tasks += tasks;
    let agent = perAgent.get(row.agentSlug);
    if (!agent) {
      agent = { agentSlug: row.agentSlug, runMs: 0, tasks: 0 };
      perAgent.set(row.agentSlug, agent);
    }
    agent.runMs += row.awakeMs;
    agent.tasks += tasks;
  }

  const agents = [...perAgent.values()].sort(
    (a, b) => b.runMs - a.runMs || a.agentSlug.localeCompare(b.agentSlug),
  );
  return {
    buckets,
    perAgent: agents,
    totalRunMs: agents.reduce((sum, a) => sum + a.runMs, 0),
    totalTasks: agents.reduce((sum, a) => sum + a.tasks, 0),
    maxBucketMs: Math.max(1, ...buckets.map((b) => b.runMs)),
    maxAgentMs: Math.max(1, ...agents.map((a) => a.runMs)),
  };
}

/**
 * Decompose a duration for i18n composition ("2h 05m" / "45m" / "<1m" / "0m").
 * Locale templates own the unit text; this owns the arithmetic only.
 */
export type DurationParts =
  | { kind: "zero" }
  | { kind: "underMinute" }
  | { kind: "minutes"; minutes: number }
  | { kind: "hoursMinutes"; hours: number; minutes: string };

export function durationParts(ms: number): DurationParts {
  if (ms <= 0) return { kind: "zero" };
  if (ms < 60_000) return { kind: "underMinute" };
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return { kind: "minutes", minutes: totalMinutes };
  return {
    kind: "hoursMinutes",
    hours: Math.floor(totalMinutes / 60),
    minutes: String(totalMinutes % 60).padStart(2, "0"),
  };
}

/** The section renders only where the gateway advertises the endpoint. */
export function showComputeSection(
  capabilities: Capabilities | null | undefined,
): boolean {
  return capabilities?.computeUsage === true;
}
