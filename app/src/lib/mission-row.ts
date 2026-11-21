import { activityRowPin } from "./agent-model-overrides.ts";
import type { TurnMode } from "./turn-mode.ts";

export interface MissionRowIdentity {
  conversationId: string;
  title: string;
  description: string;
}

export interface MissionRowPins {
  agentMode?: string;
  providerOverride?: string;
  modelOverride?: string;
  modeOverride?: TurnMode;
}

export interface MissionRowInput {
  id: string;
  title: string;
  description: string;
  agent?: string;
  provider?: string;
  model?: string;
  mode?: TurnMode;
}

export function missionRowInput(
  mission: MissionRowIdentity,
  opts: MissionRowPins,
): MissionRowInput {
  return {
    id: mission.conversationId,
    title: mission.title,
    description: mission.description,
    agent: opts.agentMode,
    ...activityRowPin(opts),
    ...(opts.modeOverride ? { mode: opts.modeOverride } : {}),
  };
}
