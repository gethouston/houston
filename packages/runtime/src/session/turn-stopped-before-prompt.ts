import type { ModelCallReport } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import {
  appendAssistantMessage,
  stampSessionReplay,
} from "../store/conversations";
import { reportMissionSettle } from "./mission-settle";

/**
 * Settle a turn the user stopped before it reached the model.
 *
 * A turn is recorded (and stoppable) before it takes the workdir lock, and its
 * setup awaits a backend switch or an autocompact before it prompts. A Stop in
 * either window marks the turn, but aborting a session that is not prompting
 * does nothing, so execTurn checks the mark after the lock and again right
 * before prompt() and ends here instead: nothing reaches the model, no tool
 * runs. cancelTurn's "Stopped by user" frame is already the turn's terminal
 * surface; this only leaves the durable trace a stop mid-prompt leaves.
 *
 * `replayedHistory`: the setup consumed a replay (a truncation's marker, a
 * cross-backend rebuild, a routine reset) that was to ride this prompt. No
 * backend saw it, so it is re-armed for the next turn. `providerSwitch` and
 * `compaction`: boundaries the setup already crossed, kept so the divider
 * survives a reload. `modelCalls`: the turn's call report, sent with the
 * settle like every other turn end's (model-call-report.ts).
 */
export function settleStoppedBeforePrompt(
  id: string,
  turnId: string,
  setup: {
    replayedHistory: boolean;
    providerSwitch: ChatMessage["providerSwitch"];
    compaction: ChatMessage["compaction"];
    modelCalls: ModelCallReport | undefined;
  },
): void {
  if (setup.replayedHistory) stampSessionReplay(id);
  appendAssistantMessage(id, "", {
    providerSwitch: setup.providerSwitch,
    compaction: setup.compaction,
    stopped: true,
    turnId,
  });
  // Same settle as a stop mid-prompt: back to the user, no interaction, and
  // `stopped` so no push notification goes out for it.
  reportMissionSettle(id, "needs_you", null, turnId, true, setup.modelCalls);
}
