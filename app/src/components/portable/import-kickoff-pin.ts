import { type KickoffPin, kickoffPinFromScan } from "../../lib/kickoff-pin.ts";

interface KickoffPinInput {
  userPickedModel: boolean;
  provider: string;
  model: string;
  lastUsedProvider: string | null | undefined;
  lastUsedModel: string | null | undefined;
  connected: readonly string[] | null;
}

export function resolveKickoffPin({
  userPickedModel,
  provider,
  model,
  lastUsedProvider,
  lastUsedModel,
  connected,
}: KickoffPinInput): KickoffPin {
  if (userPickedModel) return { provider, model };
  return (
    kickoffPinFromScan({ connected, lastUsedProvider, lastUsedModel }) ?? {}
  );
}
