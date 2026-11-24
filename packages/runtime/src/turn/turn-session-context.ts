import type { TurnMode } from "@houston/protocol";
import { runWithConversationId } from "../session/conversation-context";
import { runWithTurnMode } from "../session/turn-mode-context";
import { runWithTurnModel } from "../session/turn-model-context";

/**
 * The per-turn context a standing runtime holds around `session.prompt()`
 * (session/exec-turn.ts), for a pooled prompt: the conversation the turn runs
 * in, its live mode and the model it resolved onto. Tools read them as the
 * turn runs; without them a pooled tool cannot raise an approval card, pass
 * the host's live-turn gate, or default a mission to the parent's model.
 */
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
