import { reportDeadServedApiKey } from "../auth/served-key-guard";
import { currentTurnCredentialChannel } from "../auth/turn-credential-channel";
import { runWithActingContext } from "../session/acting-context";
import { runWithConversationScope } from "../session/bus";
import type { ReadyTurnInput } from "./execute-ready-turn";
import { turnActingContext } from "./turn-acting-context";
import { remoteActivityReader } from "./turn-mission-title-remote";
import { turnSessionRequest } from "./turn-request";
import { runTurn, type TurnOutcome } from "./turn-session";
import type { TurnRequest } from "./types";

export async function runReadyTurnSession(
  input: ReadyTurnInput,
  effectiveTurn: TurnRequest,
): Promise<{
  outcome: TurnOutcome;
  credentialChannel: ReturnType<typeof currentTurnCredentialChannel>;
}> {
  let credentialChannel: ReturnType<typeof currentTurnCredentialChannel>;
  try {
    const outcome = await runWithConversationScope(input.scope, () =>
      runWithActingContext(
        turnActingContext(input.turn, input.authPath, input.deps.poolStoreUrl),
        () => {
          credentialChannel = currentTurnCredentialChannel();
          if (credentialChannel && input.turn.credential)
            reportDeadServedApiKey(input.turn.credential);
          const directories = { ...input.filesystem, turnRoot: input.root };
          const request = turnSessionRequest(
            effectiveTurn,
            input.turnId,
            input.emit,
            input.signal,
            input.sandbox ? { call: input.sandbox.call } : undefined,
            input.timings,
            input.startup,
          );
          request.stopReason = () => input.heartbeat?.stopReason;
          if (request.missionTitle)
            request.readRemoteActivity = remoteActivityReader(
              input.resolved.store,
              input.resolved.prefix,
              input.filesystem,
            );
          return input.deps.runTurn
            ? input.deps.runTurn(directories, request)
            : runTurn(directories, request, input.deps.turnSessionDeps);
        },
      ),
    );
    return { outcome, credentialChannel };
  } catch (error) {
    return {
      outcome: {
        error: error instanceof Error ? error.message : String(error),
      },
      credentialChannel,
    };
  }
}
