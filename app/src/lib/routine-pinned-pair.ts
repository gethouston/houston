import type { Routine } from "@houston/engine-adapter";
import { routineFirePin } from "@houston/sdk";
import { DEFAULT_MODEL } from "@houston/sdk/provider-catalog";
import { toDisplayProviderIdOrNull } from "./provider-overrides";

export interface RoutinePinnedPair {
  provider: string;
  model: string;
}

export function routinePinnedPair(
  routine: Pick<Routine, "provider" | "model">,
): RoutinePinnedPair {
  const pin = routineFirePin(routine);
  const provider = toDisplayProviderIdOrNull(pin.provider) ?? "";
  if (!provider) return { provider, model: pin.model ?? "" };
  const fallback = pin.provider ? DEFAULT_MODEL[pin.provider] : undefined;
  return { provider, model: pin.model ?? fallback ?? "" };
}
