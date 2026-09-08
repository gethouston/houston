import type { LocalModelTransportContext } from "../ai/local-model-transport";
import { poolIdentity } from "./turn-store";
import type { TurnRequest } from "./types";

export function localModelContextForTurn(
  turn: TurnRequest,
  callbackUrl = process.env.HOUSTON_POOL_STORE_URL,
): LocalModelTransportContext | undefined {
  if (!callbackUrl || !turn.hostToken) return undefined;
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  return {
    baseUrl: callbackUrl,
    orgSlug: org,
    agentSlug: agent,
    hostToken: turn.hostToken,
  };
}
