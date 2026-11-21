import { storedConversationMode } from "../session/conversation-mode";
import type { TurnServerDeps } from "./server-types";
import type { TurnRequest } from "./types";

/**
 * Whether the turn's session may start beside hydration. A send that names no
 * mode runs on the mode its conversation keeps (HOU-205), which only the
 * hydrated board says, so its session waits for {@link adoptKeptMode}.
 */
export function earlySessionAllowed(
  turn: TurnRequest,
  deps: Pick<TurnServerDeps, "runTurn">,
): boolean {
  return (
    turn.mode !== undefined &&
    Boolean(turn.credential) &&
    !turn.routine &&
    !turn.shadow &&
    !deps.runTurn
  );
}

/** Give a pin-less turn its conversation's kept mode, live mode included. */
export async function adoptKeptMode(
  turn: TurnRequest,
  workspaceDir: string,
): Promise<void> {
  turn.mode = await storedConversationMode(workspaceDir, turn.conversationId);
  if (turn.liveMode) turn.liveMode.current = turn.mode ?? "execute";
}
