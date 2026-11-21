import { storedConversationMode } from "../session/conversation-mode";
import type { TurnRequest } from "./types";

/**
 * Give a pin-less turn its conversation's kept mode (HOU-205), live mode
 * included, once the hydrated board can say what it is.
 *
 * The early session start does not wait for this: model, backend and toolset
 * setup never read the mode, and the session itself is opened from the
 * adopted turn, so a pin-less send keeps the hydration overlap.
 *
 * A routine run is skipped: it always runs Autopilot (`routinePhaseTurn`),
 * whatever a person picked on the card of the chat it posts into.
 */
export async function adoptKeptMode(
  turn: TurnRequest,
  workspaceDir: string,
): Promise<void> {
  if (turn.mode !== undefined || turn.routine) return;
  turn.mode = await storedConversationMode(workspaceDir, turn.conversationId);
  if (turn.liveMode) turn.liveMode.current = turn.mode ?? "execute";
}
