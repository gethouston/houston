/**
 * Pure planning for a Mission Control "new mission" submit.
 *
 * Mission Control creates conversations across agents, so the active agent
 * and its default mode must be resolved before delegating to
 * `useMissionControl.handleCreateConversation`. Kept pure (no React, no
 * Tauri) so the routing that issue #328 regressed — a blank submit MUST
 * produce a create request whenever an agent is active — is unit-testable.
 */

import type { Agent, AgentDefinition } from "../lib/types";

export type NewMissionPlan =
  | {
      kind: "create";
      agent: Agent;
      agentMode?: string;
      promptFile?: string;
      providerOverride: string;
      modelOverride: string;
    }
  | { kind: "no-agent" };

export function planNewMission(args: {
  activeAgent: Agent | null;
  activeAgentDef: AgentDefinition | null;
  providerOverride: string;
  modelOverride: string;
}): NewMissionPlan {
  const { activeAgent, activeAgentDef, providerOverride, modelOverride } = args;
  if (!activeAgent) return { kind: "no-agent" };
  // A blank Mission Control mission runs the agent's default mode (the
  // first entry), mirroring the per-agent BoardTab "New mission" button.
  const defaultMode = activeAgentDef?.config.agents?.[0];
  return {
    kind: "create",
    agent: activeAgent,
    agentMode: defaultMode?.id,
    promptFile: defaultMode?.promptFile,
    providerOverride,
    modelOverride,
  };
}
