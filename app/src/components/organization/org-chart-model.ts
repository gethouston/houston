import type {
  Capabilities,
  ComputeUsageRow,
  UsageRow,
} from "@houston/engine-adapter";

/**
 * Pure usage maths for the org chart: the flat `(agent, user, day)` message
 * counters and the `(agent, day)` time-worked rows rolled up into one total
 * and one daily series for the whole org, and one figure for every AI
 * Employee. Every figure counts the same 30 UTC days its series draws, so a
 * total and its chart never disagree. Node:test-safe (no React, no DOM).
 */

/** The window every number on the chart counts, in UTC days. */
export const USAGE_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

interface ChartAgentKey {
  id: string;
  /** The engine route key, which is the slug usage rows carry. */
  folderPath: string;
}

/**
 * Time worked exists only where the gateway advertises the endpoint, so the
 * chart gates its query on this and never fires it off the hosted cloud.
 */
export function hoursAvailable(
  capabilities: Capabilities | null | undefined,
): boolean {
  return capabilities?.computeUsage === true;
}

/**
 * The `YYYY-MM-DD` UTC day keys of the window ending on `now`'s UTC day,
 * oldest first. Usage rows are keyed by UTC day, so a local-time window would
 * shift every bucket by one around midnight.
 */
export function usageWindow(
  now: Date,
  days: number = USAGE_WINDOW_DAYS,
): string[] {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Array.from({ length: days }, (_, index) =>
    new Date(today - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );
}

/**
 * The window's day positions, and each wire slug's agent id. Rows resolve by
 * agent id OR route key; a slug no listed agent answers to (a deleted agent,
 * a system pod) resolves to nothing and is never counted.
 */
function windowFrame(agents: readonly ChartAgentKey[], now: Date) {
  const days = usageWindow(now);
  const index = new Map(days.map((day, position) => [day, position]));
  const ids = new Map<string, string>();
  for (const agent of agents) {
    ids.set(agent.id, agent.id);
    ids.set(agent.folderPath, agent.id);
  }
  const last = days[days.length - 1] ?? "";
  return {
    from: days[0] ?? "",
    length: days.length,
    ids,
    /** A row dated past today (a gateway clock ahead of ours) is today's. */
    position: (day: string) => (day > last ? days.length - 1 : index.get(day)),
  };
}

export interface UsageTalker {
  userId: string;
  messages: number;
}

export interface AgentUsage {
  total: number;
  /** Everyone who talked to it, busiest first. */
  talkers: UsageTalker[];
}

export interface OrgChartUsage {
  byAgent: ReadonlyMap<string, AgentUsage>;
  /** One count per UTC day of the window, oldest first, zero-filled. */
  series: number[];
  total: number;
  /** The window's first UTC day, `YYYY-MM-DD`. */
  from: string;
}

/**
 * Message counts per agent and per day. Every listed agent gets an entry,
 * silent ones included, so a line never has to tell "no traffic" from "not
 * counted".
 */
export function orgChartUsage(
  agents: readonly ChartAgentKey[],
  rows: readonly UsageRow[],
  now: Date,
): OrgChartUsage {
  const frame = windowFrame(agents, now);
  const counts = new Map(agents.map((agent) => [agent.id, 0]));
  const talkers = new Map<string, Map<string, number>>();
  const series = Array.from({ length: frame.length }, () => 0);
  let total = 0;
  for (const row of rows) {
    const id = frame.ids.get(row.agentSlug);
    const day = frame.position(row.day);
    if (!id || day === undefined) continue;
    if (!Number.isFinite(row.messages) || row.messages <= 0) continue;
    counts.set(id, (counts.get(id) ?? 0) + row.messages);
    series[day] += row.messages;
    total += row.messages;
    const people = talkers.get(id) ?? new Map<string, number>();
    people.set(row.userId, (people.get(row.userId) ?? 0) + row.messages);
    talkers.set(id, people);
  }
  const byAgent = new Map(
    [...counts].map(([id, count]): [string, AgentUsage] => [
      id,
      {
        total: count,
        talkers: [...(talkers.get(id) ?? [])]
          .map(([userId, messages]) => ({ userId, messages }))
          .sort(
            (a, b) =>
              b.messages - a.messages || a.userId.localeCompare(b.userId),
          ),
      },
    ]),
  );
  return { byAgent, series, total, from: frame.from };
}

export interface OrgChartWork {
  /** Time worked per agent id over the window, in ms; silent agents at 0. */
  byAgent: ReadonlyMap<string, number>;
  /** One total per UTC day of the window, oldest first, zero-filled. */
  series: number[];
  total: number;
  /** The window's first UTC day, `YYYY-MM-DD`. */
  from: string;
}

/**
 * Time worked (`activeMs`, the time an agent spent running turns and
 * routines) over the same days the message counts cover. `awakeMs`, the
 * engine's whole up-time idle tail included, rides the wire and is never
 * counted.
 */
export function orgChartWork(
  agents: readonly ChartAgentKey[],
  rows: readonly ComputeUsageRow[],
  now: Date,
): OrgChartWork {
  const frame = windowFrame(agents, now);
  const byAgent = new Map(agents.map((agent) => [agent.id, 0]));
  const series = Array.from({ length: frame.length }, () => 0);
  let total = 0;
  for (const row of rows) {
    const id = frame.ids.get(row.agentSlug);
    const day = frame.position(row.day);
    if (!id || day === undefined) continue;
    if (!Number.isFinite(row.activeMs) || row.activeMs <= 0) continue;
    byAgent.set(id, (byAgent.get(id) ?? 0) + row.activeMs);
    series[day] += row.activeMs;
    total += row.activeMs;
  }
  return { byAgent, series, total, from: frame.from };
}
