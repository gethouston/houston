import type { ActingContext } from "../session/acting-context";
import { localModelContextForTurn } from "./local-model-context";
import type { TurnRequest } from "./types";

export function turnActingContext(
  turn: TurnRequest,
  authPath: string,
  poolStoreUrl: string | undefined,
): ActingContext {
  const owner = turn.actingAs?.userId;
  return {
    credentialScopeKey: `u:turn:${turn.workspaceId}:${turn.agentId}`,
    authPath,
    ...(turn.actingToken ? { actingAs: turn.actingToken } : {}),
    localModelTransport: localModelContextForTurn(turn, poolStoreUrl),
    ...(owner ? { actingUser: owner, verifiedOwner: owner } : {}),
  };
}
