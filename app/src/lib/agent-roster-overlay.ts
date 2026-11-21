import type { Agent } from "./types";

export interface AgentPaint {
  name?: string;
  color?: string;
}

export interface AgentPaintHold {
  id: string;
  paint: AgentPaint;
}

export interface AgentRosterHolds {
  deletes: ReadonlySet<string>;
  paints: Iterable<AgentPaintHold>;
}

export function paintAgentRow(agent: Agent, paint: AgentPaint): Agent {
  const nameChanges = paint.name !== undefined && paint.name !== agent.name;
  const colorChanges = paint.color !== undefined && paint.color !== agent.color;
  if (!nameChanges && !colorChanges) return agent;
  return {
    ...agent,
    ...(nameChanges ? { name: paint.name } : {}),
    ...(colorChanges ? { color: paint.color } : {}),
  };
}

export function overlayAgentRoster(
  agents: Agent[],
  holds: AgentRosterHolds,
): Agent[] {
  let changed = false;
  const next: Agent[] = [];
  for (const agent of agents) {
    if (holds.deletes.has(agent.id)) {
      changed = true;
      continue;
    }
    let painted = agent;
    for (const hold of holds.paints) {
      if (hold.id === agent.id) painted = paintAgentRow(painted, hold.paint);
    }
    if (painted !== agent) changed = true;
    next.push(painted);
  }
  return changed ? next : agents;
}

export function restoreAgentRow(
  agents: Agent[],
  row: Agent,
  index: number,
): Agent[] {
  if (agents.some((a) => a.id === row.id)) return agents;
  const at = Math.min(Math.max(index, 0), agents.length);
  return [...agents.slice(0, at), row, ...agents.slice(at)];
}

export function selectionAfterRefusedDelete(
  current: Agent | null,
  switchedTo: Agent | null,
  row: Agent,
): Agent | null {
  if ((current?.id ?? null) !== (switchedTo?.id ?? null)) return null;
  return current?.id === row.id ? null : row;
}
