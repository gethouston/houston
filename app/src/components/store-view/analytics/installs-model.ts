import type { CreatorInstallRow } from "@houston-ai/engine-client";

/**
 * Pure aggregation for the creator Installs panel (no DOM, no i18n): folds the
 * gateway's per-(agent, UTC day) install rows into a zero-filled daily series
 * over the selected window, rolls up per-agent totals, and floors the busiest
 * day at 1 so bar math never divides by zero. One metric only — installs; the
 * companion breakdown answers "which of my agents drove them".
 */

/** The selectable windows (days). The gateway ceiling is 90. */
export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Server ceiling for the analytics window (`GET /me/analytics?days<=90`). */
export const MAX_ANALYTICS_DAYS = 90;

export interface InstallBucket {
  /** UTC day (`YYYY-MM-DD`) — the bar's identity/label. */
  day: string;
  installs: number;
}

export interface InstallAgentTotals {
  agentId: string;
  /** Public slug when the agent has one; null for a slug-less listing. */
  slug: string | null;
  installs: number;
}

export interface InstallsModel {
  /** Total installs per UTC day, zero-filled across the whole window. */
  buckets: InstallBucket[];
  /** Per-agent totals over the window, busiest first. */
  perAgent: InstallAgentTotals[];
  /**
   * Sum of the charted buckets — always equal to the bars on screen, so the
   * total line and the chart can never disagree (the wire `totals.installs` is
   * for the raw request window; this is for what actually renders).
   */
  totalInstalls: number;
  /** Busiest day's installs, floored at 1 so bar math never divides by zero. */
  maxBucketInstalls: number;
  /** Busiest agent's installs, floored at 1 (scales the breakdown bars). */
  maxAgentInstalls: number;
}

const DAY_MS = 86_400_000;

const dayString = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Keep the requested window inside the server's [1, 90]-day range. */
export function clampDays(days: number): number {
  if (!Number.isFinite(days)) return MAX_ANALYTICS_DAYS;
  return Math.min(MAX_ANALYTICS_DAYS, Math.max(1, Math.floor(days)));
}

/**
 * Build the daily install series + per-agent breakdown for a window of `days`
 * ending at `nowMs`'s UTC day. Rows before the window are dropped; future-dated
 * rows (clock skew) fold into today's bucket rather than vanishing — the server
 * is the time authority, not us.
 */
export function buildInstallsModel(
  rows: readonly CreatorInstallRow[],
  days: number,
  nowMs: number,
): InstallsModel {
  const window = clampDays(days);
  const today = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const first = today - (window - 1) * DAY_MS;
  const todayKey = dayString(today);
  const buckets: InstallBucket[] = Array.from({ length: window }, (_, i) => ({
    day: dayString(first + i * DAY_MS),
    installs: 0,
  }));
  const byDay = new Map(buckets.map((bucket) => [bucket.day, bucket]));
  const perAgent = new Map<string, InstallAgentTotals>();

  for (const row of rows) {
    const ts = dayStart(row.day);
    if (Number.isNaN(ts) || ts < first) continue;
    const bucket = byDay.get(ts > today ? todayKey : row.day);
    if (!bucket) continue;
    bucket.installs += row.installs;
    let agent = perAgent.get(row.agentId);
    if (!agent) {
      agent = { agentId: row.agentId, slug: row.slug, installs: 0 };
      perAgent.set(row.agentId, agent);
    }
    agent.installs += row.installs;
    // Keep the first non-null slug the agent's rows carry.
    if (agent.slug === null && row.slug !== null) agent.slug = row.slug;
  }

  const agents = [...perAgent.values()].sort(
    (a, b) => b.installs - a.installs || a.agentId.localeCompare(b.agentId),
  );
  return {
    buckets,
    perAgent: agents,
    totalInstalls: buckets.reduce((sum, bucket) => sum + bucket.installs, 0),
    maxBucketInstalls: Math.max(1, ...buckets.map((bucket) => bucket.installs)),
    maxAgentInstalls: Math.max(1, ...agents.map((agent) => agent.installs)),
  };
}
