import type { UsageRow } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free aggregation for the Organization Usage tab (Teams v2). Rolls
 * the flat `(agent, user, day)` message counters up into per-agent totals with
 * a per-person breakdown, both sorted busiest-first, so the view is a dumb
 * render of a tested shape. Node:test-safe (no React, no DOM).
 */

/** One person's message total for a single agent, over the window. */
export interface UsagePerson {
  userId: string;
  messages: number;
}

/** One agent's total messages over the window, with its per-person split. */
export interface UsageAgent {
  agentSlug: string;
  messages: number;
  people: UsagePerson[];
}

/**
 * Collapse usage rows into per-agent totals (busiest agent first), each with a
 * per-person breakdown (busiest person first). Ties break by slug/id for a
 * stable, deterministic order. Zero/negative counts are ignored so a stray
 * counter can't invent an empty person row.
 */
export function aggregateUsage(rows: readonly UsageRow[]): UsageAgent[] {
  const byAgent = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!(row.messages > 0)) continue;
    let people = byAgent.get(row.agentSlug);
    if (!people) {
      people = new Map();
      byAgent.set(row.agentSlug, people);
    }
    people.set(row.userId, (people.get(row.userId) ?? 0) + row.messages);
  }

  const agents: UsageAgent[] = [];
  for (const [agentSlug, peopleMap] of byAgent) {
    const people: UsagePerson[] = [...peopleMap.entries()]
      .map(([userId, messages]) => ({ userId, messages }))
      .sort(
        (a, b) => b.messages - a.messages || a.userId.localeCompare(b.userId),
      );
    const messages = people.reduce((sum, p) => sum + p.messages, 0);
    agents.push({ agentSlug, messages, people });
  }

  return agents.sort(
    (a, b) => b.messages - a.messages || a.agentSlug.localeCompare(b.agentSlug),
  );
}

/** The busiest agent's total, for scaling the bar widths (never 0). */
export function usageMax(agents: readonly UsageAgent[]): number {
  return agents.reduce((max, a) => Math.max(max, a.messages), 0) || 1;
}

/** Grand total of all messages in the window (for the summary line). */
export function usageTotal(agents: readonly UsageAgent[]): number {
  return agents.reduce((sum, a) => sum + a.messages, 0);
}
