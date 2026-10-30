import { runTurnAttempt, type TurnAttemptState } from "./session-turn-attempt";
import { claudeTurnPromptTokens } from "./turn-prompt-size";

/** One turn as `ClaudeSession.prompt` runs it, minus the session's own state. */
export interface SessionTurn {
  text: string;
  resume: string | undefined;
  /** The context the resumed transcript carries in, when known. */
  fill: number | undefined;
  conversationId: string;
  /** The replay a fresh rerun opens with. */
  freshPrefix: () => string;
  /** Why the first attempt asked for the rerun, for the warn line. */
  retryReason: () => string;
  /** True once the session was disposed or stopped. */
  stopped: () => boolean;
}

/**
 * Run the turn, and once more as a fresh session when the SDK refused the
 * resume id (its cwd-scoped lookup missed the transcript, e.g. the workspace
 * was renamed) or resumed it with Houston's tool server detached
 * (PRODUCT-1706). The stale mapping is already dropped by then, so the rerun
 * is what keeps a conversation that can never resume again from erroring.
 */
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
