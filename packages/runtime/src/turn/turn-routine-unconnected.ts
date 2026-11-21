import { savedActiveProviderIn } from "./op-settings";
import { turnIsUnconnected } from "./turn-request";
import type { TurnRequest } from "./types";

export function unconnectedRoutineTurn(
  turn: Pick<TurnRequest, "credential">,
  provider: string | undefined,
  dataDir: string,
): { provider?: string } | undefined {
  if (!turnIsUnconnected(turn)) return undefined;
  const named = provider || savedActiveProviderIn(dataDir);
  return named ? { provider: named } : {};
}
