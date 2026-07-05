import type { Routine } from "@houston/protocol";
import { canonicalModelId, canonicalProviderId } from "./provider-model";

/** A routine's provider/model pin after read-time legacy mapping. */
export interface RoutinePin {
  provider: string | null;
  model: string | null;
}

/**
 * The provider/model pin a routine's fired turn should carry, with the same
 * read-time legacy mapping the agent config gets (the shared canonical ladder
 * in provider-model.ts): a Rust-era pin ("claude", "codex") maps to its pi id,
 * and a legacy model alias maps at the same tier. Never persisted back
 * (downgrade-safe), and never a silent provider switch: a provider id that is
 * neither valid nor a known alias passes through verbatim so the fire path
 * rejects it with a visible reason instead of running on a provider the user
 * never chose.
 */
export function routinePin(routine: Routine): RoutinePin {
  const rawProvider = routine.provider ?? null;
  const rawModel = routine.model ?? null;
  if (!rawProvider) return { provider: null, model: rawModel };
  const provider = canonicalProviderId(rawProvider);
  if (!provider) return { provider: rawProvider, model: rawModel };
  if (!rawModel) return { provider, model: null };
  // Model: the shared ladder (valid id / open catalog / same-tier alias), else
  // drop the model pin so the provider's saved/default model applies — the
  // pinned PROVIDER is the user's real choice; an unmappable CLI-era model id
  // must not hard-fail every run (dispatch validates a pinned model id
  // strictly).
  return { provider, model: canonicalModelId(provider, rawModel) };
}
