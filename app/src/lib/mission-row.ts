// Explicit `.ts` extension: `node --test --experimental-strip-types` loads this
// module directly (app/tests/mission-row.test.ts).
import { activityRowPin } from "./agent-model-overrides.ts";

/** What a new mission is called, before anything hits the wire. */
export interface MissionRowIdentity {
  conversationId: string;
  title: string;
  description: string;
}

/** The send's pins, in the display dialect the composer and picker speak. */
export interface MissionRowPins {
  agentMode?: string;
  providerOverride?: string;
  modelOverride?: string;
}

/** The create-route payload for one board row. */
export interface MissionRowInput {
  id: string;
  title: string;
  description: string;
  agent?: string;
  provider?: string;
  model?: string;
}

/**
 * The board row a new mission is created with, shared by BOTH creation paths:
 * the optimistic composer send (`create-mission-now.ts`) and the warming
 * queue's deferred write (`create-mission-warming.ts`).
 *
 * The provider is stamped in pi's CANONICAL dialect — the one every send path
 * reads a row back in (`activityRowPin`, `preferRowPin`) — and a model the
 * catalog could not resolve is left OFF the row rather than written as an empty
 * string, which reads downstream as a mission pinned to no model at all.
 */
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
  };
}
