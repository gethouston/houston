import { accessDigest } from "@houston/protocol/access-digest";
import type { TurnCredentialChannel } from "../auth/turn-credential-channel";
import type { ActingContext } from "../session/acting-context";
import { localModelContextForTurn } from "./local-model-context";
import { poolIdentity } from "./turn-store";
import type { TurnRequest } from "./types";

export function turnActingContext(
  turn: TurnRequest,
  authPath: string,
  poolStoreUrl: string | undefined,
): ActingContext {
  const owner = turn.actingAs?.userId;
  const credentialChannel = turnCredentialChannel(turn);
  return {
    credentialScopeKey: `u:turn:${turn.workspaceId}:${turn.agentId}`,
    authPath,
    ...(turn.actingToken ? { actingAs: turn.actingToken } : {}),
    localModelTransport: localModelContextForTurn(turn, poolStoreUrl),
    ...(owner ? { actingUser: owner, verifiedOwner: owner } : {}),
    ...(credentialChannel ? { credentialChannel } : {}),
  };
}

export function turnCredentialChannel(
  turn: TurnRequest,
): TurnCredentialChannel | undefined {
  if (!turn.claim || !turn.hostToken || !turn.credential) return undefined;
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  return {
    baseUrl: new URL(turn.claim.heartbeatUrl).origin,
    orgSlug: org,
    agentSlug: agent,
    hostToken: turn.hostToken,
    ...(turn.actingToken ? { actingAs: turn.actingToken } : {}),
    provider: turn.credential.provider,
    kind: turn.credential.kind ?? "oauth",
    scope: turn.credential.scope ?? "team",
    accessSha256: accessDigest(turn.credential.access),
    ...(turn.credential.health ? { health: turn.credential.health } : {}),
  };
}
