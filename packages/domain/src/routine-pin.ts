import type { Routine } from "@houston/protocol";
import {
  isProviderId,
  MODEL_ALIASES,
  PROVIDER_ALIASES,
  VALID_MODELS,
} from "./provider-model-catalog";

/** A routine's provider/model pin after read-time legacy mapping. */
export interface RoutinePin {
  provider: string | null;
  model: string | null;
}

/**
 * The provider/model pin a routine's fired turn should carry, with the same
 * read-time legacy mapping the agent config gets (see provider-model.ts): a
 * Rust-era pin ("claude", "codex") maps to its pi id, and a legacy model alias
 * maps at the same tier. Never persisted back (downgrade-safe), and never a
 * silent provider switch: a provider id that is neither valid nor a known
 * alias passes through verbatim so the runtime rejects it with a visible
 * reason instead of running on a provider the user never chose.
 */
export function routinePin(routine: Routine): RoutinePin {
  const rawProvider = routine.provider ?? null;
  const rawModel = routine.model ?? null;
  if (!rawProvider) return { provider: null, model: rawModel };
  const provider = isProviderId(rawProvider)
    ? rawProvider
    : (PROVIDER_ALIASES[rawProvider] ?? null);
  if (!provider) return { provider: rawProvider, model: rawModel };
  if (!rawModel) return { provider, model: null };
  // Model: keep a valid id, map a known alias, otherwise drop the model pin so
  // the provider's saved/default model applies — the pinned PROVIDER is the
  // user's real choice; an unmappable CLI-era model id must not hard-fail
  // every run (dispatch validates a pinned model id strictly).
  const valid = VALID_MODELS[provider];
  if (!valid) return { provider, model: rawModel }; // open-catalog gateway
  if (valid.has(rawModel)) return { provider, model: rawModel };
  const alias = MODEL_ALIASES[provider]?.[rawModel];
  return { provider, model: alias && valid.has(alias) ? alias : null };
}
