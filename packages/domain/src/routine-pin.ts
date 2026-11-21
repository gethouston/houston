import type { Routine } from "@houston/protocol";
import { canonicalModelId, canonicalProviderId } from "./provider-model";

export interface RoutinePin {
  provider: string | null;
  model: string | null;
}

export function routinePin(
  routine: Pick<Routine, "provider" | "model">,
): RoutinePin {
  const rawProvider = routine.provider ?? null;
  const rawModel = routine.model ?? null;
  if (!rawProvider) return { provider: null, model: rawModel };
  const provider = canonicalProviderId(rawProvider);
  if (!provider) return { provider: rawProvider, model: rawModel };
  if (!rawModel) return { provider, model: null };
  return { provider, model: canonicalModelId(provider, rawModel) };
}
