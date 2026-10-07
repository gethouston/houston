import { runWithActingContext } from "../session/acting-context";
import { runWithConversationScope } from "../session/bus";
import { localModelContextForTurn } from "./local-model-context";
import type { TurnRequest } from "./types";

/**
 * The scope a pooled turn's session opens and runs in: its conversation's
 * event scope and the acting context its credential reads resolve against.
 * The early session open (turn-early-session.ts) enters the same one, so
 * whatever it reads resolves exactly as it would at the prompt.
 */
export function runInTurnScope<T>(
  input: {
    turn: TurnRequest;
    authPath: string;
    poolStoreUrl: string | undefined;
  },
  fn: () => T,
): T {
  const { turn } = input;
  return runWithConversationScope(`${turn.workspaceId}/${turn.agentId}`, () =>
    runWithActingContext(
      {
        credentialScopeKey: `u:turn:${turn.workspaceId}:${turn.agentId}`,
        authPath: input.authPath,
        ...(turn.actingToken ? { actingAs: turn.actingToken } : {}),
        localModelTransport: localModelContextForTurn(turn, input.poolStoreUrl),
        ...(turn.actingAs ? { actingUser: turn.actingAs.userId } : {}),
      },
      fn,
    ),
  );
}
