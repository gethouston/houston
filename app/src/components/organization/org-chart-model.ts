import type {
  Capabilities,
  ComputeUsageRow,
  UsageRow,
} from "@houston/engine-adapter";

export const USAGE_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

interface ChartAgentKey {
  id: string;
  folderPath: string;
}

export function hoursAvailable(
  capabilities: Capabilities | null | undefined,
): boolean {
  return capabilities?.computeUsage === true;
}

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
    position: (day: string) => (day > last ? days.length - 1 : index.get(day)),
  };
}

export interface UsageTalker {
  userId: string;
  messages: number;
}

export interface AgentUsage {
  total: number;
  talkers: UsageTalker[];
}

export interface OrgChartUsage {
  byAgent: ReadonlyMap<string, AgentUsage>;
  series: number[];
  total: number;
  from: string;
}

export function orgChartUsage(
  agents: readonly ChartAgentKey[],
  rows: readonly UsageRow[],
  now: Date,
): OrgChartUsage {
  const frame = windowFrame(agents, now);
  const counts = new Map(agents.map((agent) => [agent.id, 0]));
  const talkers = new Map<string, Map<string, number>>();
  const series = new Array<number>(frame.length).fill(0);
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
  byAgent: ReadonlyMap<string, number>;
  series: number[];
  total: number;
  from: string;
}

export function orgChartWork(
  agents: readonly ChartAgentKey[],
  rows: readonly ComputeUsageRow[],
  now: Date,
): OrgChartWork {
  const frame = windowFrame(agents, now);
  const byAgent = new Map(agents.map((agent) => [agent.id, 0]));
  const series = new Array<number>(frame.length).fill(0);
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
