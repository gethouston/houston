import type { MissionGuidance } from "@houston/host/src/houston-prompt-missions";
import type { PiBackendDeps } from "../backends/pi/backend";
import { makeAgentDirectoryTools } from "../session/tools/agent-directory";
import { makeMissionTools } from "../session/tools/missions";
import { makeReadMissionTool } from "../session/tools/read-mission";
import {
  missionProviders,
  turnAssistantOptions,
} from "./turn-coordinator-tools";
import type { TurnSessionRequest } from "./turn-session";

export function turnHasMissionFamily(turn: TurnSessionRequest): boolean {
  return (
    turn.role !== "coordinator" && turn.sandbox?.missionGuidance !== undefined
  );
}

export async function turnMissionGuidance(
  turn: TurnSessionRequest,
): Promise<MissionGuidance> {
  if (turnAssistantOptions(turn)) return "full";
  if (!turnHasMissionFamily(turn) || !turn.sandbox?.missionGuidance)
    return "none";
  return turn.sandbox.missionGuidance;
}

export function buildTurnMissionTools(
  turn: TurnSessionRequest,
): PiBackendDeps["customTools"] {
  if (!turn.sandbox || !turnHasMissionFamily(turn)) return [];
  const call = turn.sandbox.call;
  return [
    ...makeMissionTools({
      call,
      personalAssistant: false,
      providers: missionProviders(),
      resolveProviders: missionProviders,
    }),
    makeReadMissionTool({ call, personalAssistant: false, inProcess: false }),
    ...makeAgentDirectoryTools({ call }),
  ];
}
