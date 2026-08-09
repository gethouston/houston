/**
 * Pure planning for a Mission Control "new mission" submit.
 *
 * Mission Control creates conversations ACROSS agents, so the target agent has
 * to be resolved (and its absence handled) before delegating to
 * `useMissionControl.handleCreateConversation`. Kept pure (no React, no Tauri)
 * so the routing that issue #328 regressed — a blank submit MUST produce a
 * create request whenever an agent is active, and a loud `no-agent` when none
 * is, never a silently cleared composer — stays unit-testable.
 */

import type { Agent } from "../lib/types";

export type NewMissionPlan =
  | {
      kind: "create";
      agent: Agent;
      providerOverride: string;
      modelOverride: string;
    }
  | { kind: "no-agent" };

export function planNewMission(args: {
  activeAgent: Agent | null;
  providerOverride: string;
  modelOverride: string;
}): NewMissionPlan {
  const { activeAgent, providerOverride, modelOverride } = args;
  if (!activeAgent) return { kind: "no-agent" };
  return {
    kind: "create",
    agent: activeAgent,
    providerOverride,
    modelOverride,
  };
}
