import { isAgentSetupMode } from "./agent-setup-mode.ts";
import {
  type SetupGreetingEntry,
  setupGreetingRole,
} from "./setup-mission-greeting.ts";

export interface SetupHello {
  name: string;
  role: string | null;
}

export interface SetupHelloState {
  isSetupMission: boolean;
  hello: SetupHello | null;
}

export interface SetupMissionMarks {
  entry: SetupGreetingEntry | null;
  activityAgentMode: string | null | undefined;
}

export function isSetupMissionChat(marks: SetupMissionMarks): boolean {
  return !!marks.entry || isAgentSetupMode(marks.activityAgentMode);
}

export function setupInstructionsTarget(
  marks: SetupMissionMarks & { agentPath: string | null | undefined },
): string | undefined {
  if (!marks.agentPath) return undefined;
  return isSetupMissionChat(marks) ? marks.agentPath : undefined;
}

export interface SetupHelloInput extends SetupMissionMarks {
  agentName: string | undefined;
  instructions: string | undefined;
  instructionsFetched: boolean;
}

export function deriveSetupHello(input: SetupHelloInput): SetupHelloState {
  const isSetupMission = isSetupMissionChat(input);
  if (!isSetupMission) return { isSetupMission: false, hello: null };

  const name = input.entry?.agentName ?? input.agentName;
  const description = input.instructionsFetched
    ? input.instructions || undefined
    : undefined;
  const ready = !!input.entry || !!description;
  if (!ready || !name) return { isSetupMission, hello: null };

  return {
    isSetupMission,
    hello: {
      name,
      role: input.entry ? input.entry.role : setupGreetingRole(description),
    },
  };
}
