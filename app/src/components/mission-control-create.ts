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
