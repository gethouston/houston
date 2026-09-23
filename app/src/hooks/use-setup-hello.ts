/**
 * The chat panel's one read of the self-setup mission's hello: the creation
 * record, the agent's job description, and the rule that picks between them
 * (`lib/setup-hello.ts`, which holds the rule and its tests).
 *
 * The job-description read is enabled for the whole setup mission, not only
 * once the record is gone, so the handover at the record's TTL costs the user
 * nothing: the answer is already in hand when the record stops answering.
 */

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
  /** The activity's own `agent` (mode) field. */
  activityAgentMode: string | null | undefined;
  /** The agent's name as the roster holds it. */
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
