import type { Agent } from "./types.ts";

export interface FailedAgentRead {
  id: string;
  name: string;
  folderPath: string;
}

export interface AgentReadFailures {
  failed: FailedAgentRead[];
  total: number;
}

export interface AgentReadResult {
  agent: Agent;
  error: unknown;
}

export function agentReadFailures(
  results: AgentReadResult[],
): AgentReadFailures {
  return {
    failed: results
      .filter((r) => r.error != null)
      .map(({ agent }) => ({
        id: agent.id,
        name: agent.name,
        folderPath: agent.folderPath,
      })),
    total: results.length,
  };
}

export function mergeAgentReadFailures(
  a: AgentReadFailures,
  b: AgentReadFailures,
): AgentReadFailures {
  const named = new Set(a.failed.map((f) => f.id));
  return {
    failed: [...a.failed, ...b.failed.filter((f) => !named.has(f.id))],
    total: Math.max(a.total, b.total),
  };
}

export function allAgentReadsFailed(f: AgentReadFailures): boolean {
  return f.total > 0 && f.failed.length === f.total;
}
