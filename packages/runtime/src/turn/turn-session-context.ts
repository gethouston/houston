import type { TurnMode } from "@houston/protocol";
import { runWithConversationId } from "../session/conversation-context";
import { runWithTurnMode } from "../session/turn-mode-context";
import { runWithTurnModel } from "../session/turn-model-context";

export function runInTurnContext<T>(
  turn: {
    conversationId: string;
    mode: TurnMode;
    liveMode?: import("../session/turn-mode-context").TurnModeRef;
    model: { provider: string; id: string };
    dataDir: string;
  },
  fn: () => T,
): T {
  return runWithConversationId(
    turn.conversationId,
    () =>
      runWithTurnMode(turn.liveMode ?? { current: turn.mode }, () =>
        runWithTurnModel(
          { provider: turn.model.provider, model: turn.model.id },
          fn,
        ),
      ),
    turn.dataDir,
  );
}
