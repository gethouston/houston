import {
  type AgentPaint,
  type AgentPaintHold,
  overlayAgentRoster,
} from "../lib/agent-roster-overlay";
import type { Agent } from "../lib/types";

const deletes = new Set<string>();
const paints = new Set<AgentPaintHold>();

export function holdAgentDelete(id: string): () => void {
  deletes.add(id);
  return () => {
    deletes.delete(id);
  };
}

export function holdAgentPaint(id: string, paint: AgentPaint): () => void {
  const hold: AgentPaintHold = { id, paint };
  paints.add(hold);
  return () => {
    paints.delete(hold);
  };
}

export function carryAgentPaints(fromId: string, toId: string): void {
  for (const hold of paints) if (hold.id === fromId) hold.id = toId;
}

export function overlayHeldAgentWrites(agents: Agent[]): Agent[] {
  return overlayAgentRoster(agents, { deletes, paints });
}

export function clearAgentHolds(): void {
  deletes.clear();
  paints.clear();
}
