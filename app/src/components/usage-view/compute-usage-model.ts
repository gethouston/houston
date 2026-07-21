import type { Capabilities, ComputeUsageRow } from "@houston-ai/engine-client";

/**
 * Pure aggregation for the Compute section (no DOM, no i18n): buckets the
 * gateway's per-(agent, UTC day) rows into the selected range and rolls up
 * per-agent totals. The user sees ONE time metric — time worked = `activeMs`
 * (time the agent actually executed turns/routine runs); `awakeMs` (the
 * engine's full up-time, idle tail included) rides the wire but is
 * deliberately never rendered. The companion stat is messages: turns plus
 * routine runs, i.e. every exchange the agent handled.
 */

export type ComputeRange = "week" | "month" | "quarter";

export interface ComputeBucket {
  /** First UTC day of the bucket (`YYYY-MM-DD`) — the bar's identity/label. */
  startDay: string;
  /** Days folded into this bucket (1 for daily ranges, 7 for weekly). */
  days: number;
  workMs: number;
  messages: number;
}

export interface ComputeAgentTotals {
  agentSlug: string;
  workMs: number;
  messages: number;
}

export interface ComputeModel {
  buckets: ComputeBucket[];
  perAgent: ComputeAgentTotals[];
  totalWorkMs: number;
  totalMessages: number;
  /** Busiest bucket/agent, floored at 1 so bar math never divides by zero. */
  maxBucketMs: number;
  maxAgentMs: number;
}

const DAY_MS = 86_400_000;

const dayString = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** The slug/id shape the agent store exposes for matching wire rows. */
export interface KnownAgentRef {
  id: string;
  folderPath?: string;
}

/**
 * Keep only rows belonging to agents the user actually has (the sidebar's
 * roster). Everything else — deleted agents' history, any system pod an
 * unpatched gateway still serves — must not exist for the user: not in the
 * list, not in the chart, not in the totals.
 */
export function onlyKnownAgents(
  rows: readonly ComputeUsageRow[],
  agents: readonly KnownAgentRef[],
): ComputeUsageRow[] {
  const known = new Set<string>();
  for (const agent of agents) {
    known.add(agent.id);
    if (agent.folderPath) known.add(agent.folderPath);
  }
  return rows.filter((row) => known.has(row.agentSlug));
}

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
    workMs: 0,
    messages: 0,
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
    const messages = row.turns + row.routineRuns;
    bucket.workMs += row.activeMs;
    bucket.messages += messages;
    let agent = perAgent.get(row.agentSlug);
    if (!agent) {
      agent = { agentSlug: row.agentSlug, workMs: 0, messages: 0 };
      perAgent.set(row.agentSlug, agent);
    }
    agent.workMs += row.activeMs;
    agent.messages += messages;
  }

  const agents = [...perAgent.values()].sort(
    (a, b) => b.workMs - a.workMs || a.agentSlug.localeCompare(b.agentSlug),
  );
  return {
    buckets,
    perAgent: agents,
    totalWorkMs: agents.reduce((sum, a) => sum + a.workMs, 0),
    totalMessages: agents.reduce((sum, a) => sum + a.messages, 0),
    maxBucketMs: Math.max(1, ...buckets.map((b) => b.workMs)),
    maxAgentMs: Math.max(1, ...agents.map((a) => a.workMs)),
  };
}

/**
 * The by-agent list is ROSTER-driven: every agent the user has appears the
 * moment it exists (a just-created agent shows "0m · 0 messages" immediately),
 * merged with whatever totals the range holds. Busiest first, zeros last in
 * roster order. `agentSlug` for a row-less agent is its folderPath (the wire
 * key rows will use once data lands) falling back to its id.
 */
export function withRosterAgents(
  roster: readonly KnownAgentRef[],
  perAgent: readonly ComputeAgentTotals[],
): ComputeAgentTotals[] {
  const bySlug = new Map(perAgent.map((agent) => [agent.agentSlug, agent]));
  const merged = roster.map((agent) => {
    const totals =
      (agent.folderPath ? bySlug.get(agent.folderPath) : undefined) ??
      bySlug.get(agent.id);
    return (
      totals ?? {
        agentSlug: agent.folderPath ?? agent.id,
        workMs: 0,
        messages: 0,
      }
    );
  });
  return merged.sort((a, b) => b.workMs - a.workMs);
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
