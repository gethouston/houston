/**
 * Agent path resolution without importing the agent store from tauri (breaks cycles).
 * Registered by `stores/agents.ts` on module load.
 */

import type { Agent } from "./types";

type AgentLookup = {
  agentFromPath: (agentPath: string) => Agent | null;
  currentAgent: () => Agent | null;
};

let lookup: AgentLookup | null = null;

export function registerAgentLookup(impl: AgentLookup): void {
  lookup = impl;
}

export function agentFromPath(agentPath: string): Agent | null {
  return lookup?.agentFromPath(agentPath) ?? null;
}

export function currentAgent(): Agent | null {
  return lookup?.currentAgent() ?? null;
}
