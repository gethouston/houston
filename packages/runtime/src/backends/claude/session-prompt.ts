import { runTurnAttempt, type TurnAttemptState } from "./session-turn-attempt";
import { claudeTurnPromptTokens } from "./turn-prompt-size";

export interface SessionTurn {
  text: string;
  resume: string | undefined;
  fill: number | undefined;
  conversationId: string;
  freshPrefix: () => string;
  retryReason: () => string;
  stopped: () => boolean;
}

export async function runSessionTurn(
  state: () => TurnAttemptState,
  turn: SessionTurn,
): Promise<"success" | "failed" | "retry-fresh"> {
  const outcome = await runTurnAttempt(state(), {
    text: turn.text,
    resume: turn.resume,
    promptTokens: claudeTurnPromptTokens(turn.fill, turn.text),
  });
  if (outcome !== "retry-fresh" || turn.stopped()) return outcome;
  console.warn(
    `[claude] resume for conversation ${turn.conversationId} ${turn.retryReason()}; starting a fresh session`,
  );
  const retryText = `${turn.freshPrefix()}${turn.text}`;
  return runTurnAttempt(state(), {
    text: retryText,
    resume: undefined,
    promptTokens: claudeTurnPromptTokens(undefined, retryText),
  });
}
