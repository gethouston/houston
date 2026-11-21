import { storedConversationMode } from "../session/conversation-mode";
import type { TurnRequest } from "./types";

export async function adoptKeptMode(
  turn: TurnRequest,
  workspaceDir: string,
): Promise<void> {
  if (turn.mode !== undefined || turn.routine) return;
  turn.mode = await storedConversationMode(workspaceDir, turn.conversationId);
  if (turn.liveMode) turn.liveMode.current = turn.mode ?? "execute";
}
