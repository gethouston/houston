import { useMemo } from "react";
import {
  deriveSetupHello,
  type SetupHelloState,
  setupInstructionsTarget,
} from "../lib/setup-hello";
import { useInstructions } from "./queries/use-instructions";
import { useSetupGreeting } from "./use-setup-greeting";

export function useSetupHello(args: {
  agentPath: string | null | undefined;
  sessionKey: string | null | undefined;
  activityAgentMode: string | null | undefined;
  agentName: string | undefined;
}): SetupHelloState {
  const entry = useSetupGreeting(args.agentPath, args.sessionKey);
  const marks = { entry, activityAgentMode: args.activityAgentMode };
  const instructions = useInstructions(
    setupInstructionsTarget({ ...marks, agentPath: args.agentPath }),
  );
  const instructionsData = instructions.data;
  const instructionsFetched = instructions.isFetched;
  const { agentName, activityAgentMode } = args;
  return useMemo(
    () =>
      deriveSetupHello({
        entry,
        activityAgentMode,
        agentName,
        instructions: instructionsData,
        instructionsFetched,
      }),
    [
      entry,
      activityAgentMode,
      agentName,
      instructionsData,
      instructionsFetched,
    ],
  );
}
