import { canonicalModelId, canonicalProviderId } from "./provider-model";
import { namedModelList, resolveSpokenModel } from "./provider-model-display";

/**
 * The ONE ladder that turns whatever an agent wrote for a provider/model into a
 * real id — or into a refusal that names every value it could have used.
 *
 * The incident: an assistant asked to start a mission on "codex", then on
 * "openai", and both times got `unknown provider` and nothing else. The real id
 * is `openai-codex`; nothing in the tool, the schema or the error ever said so,
 * so the model guessed and gave up. Identifiers are never guessable: they are
 * either listed in the tool's own schema/description or spelled out by the
 * rejection.
 *
 * Pure and table-driven so the tool (which knows the runtime's live provider
 * status) and the host route (which validates the same call again at execution
 * time) share ONE resolution and ONE vocabulary — a value the tool accepts can
 * never be a value the host spells differently.
 */

/** One provider an agent may pin, as the caller's registry sees it right now. */
export interface ProviderOption {
  /** The wire id (`openai-codex`) — what a pin must ultimately carry. */
  id: string;
  /** The human name the app shows (`ChatGPT / Codex (Plus / Pro)`). */
  name: string;
  /** Whether it can serve a turn here, from the caller's own status signal. */
  connected: boolean;
  /**
   * The model ids the registry enumerates for this provider. Absent/empty means
   * an OPEN catalog (a gateway that forwards any id, a BYO endpoint): a model is
   * then accepted as written and the provider's own error is what surfaces.
   */
  models?: readonly string[];
}

export type ChoiceResolution =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "unknown" | "disconnected" | "none_connected";
      message: string;
    };

/** At most this many models in one rejection — a full gateway catalog is
 *  hundreds of ids and would drown the sentence the model has to act on. The
 *  rejection lists the NAMED rows first, so every id a user can ask for by name
 *  survives the cap. */
const MAX_LISTED_MODELS = 25;

/** `id (Display Name)` for every CONNECTED option, in registry order. */
export function connectedProviderList(
  options: readonly ProviderOption[],
): string {
  return options
    .filter((o) => o.connected)
    .map((o) => `${o.id} (${o.name})`)
    .join(", ");
}

/**
 * Resolve a written provider to a connected id. Accepts the id, the display
 * name, and the legacy/friendly aliases (`codex`, `chatgpt`, `claude`,
 * `gemini`…) — all case-insensitive — through the same alias ladder the routine
 * pins and the config migration use. Anything else is refused WITH the list.
 */
export function resolveProviderChoice(
  raw: string,
  options: readonly ProviderOption[],
  operation: string,
): ChoiceResolution {
  const connected = connectedProviderList(options);
  const given = JSON.stringify(raw);
  if (!connected) {
    return {
      ok: false,
      reason: "none_connected",
      message: `No AI provider is connected here, so "provider" cannot be pinned. Omit it and ${operation} uses the agent's current model. You gave ${given}.`,
    };
  }
  const match = matchProvider(raw, options);
  if (!match) {
    return {
      ok: false,
      reason: "unknown",
      message: `The value given for "provider" does not match what ${operation} accepts. "provider" must be one of: ${connected}. You gave ${given}. Omit "provider" to use the agent's current model.`,
    };
  }
  if (!match.connected) {
    return {
      ok: false,
      reason: "disconnected",
      message: `${match.id} (${match.name}) is not connected here, so a mission pinned to it would fail. Connect it in Houston first (the user does that in the app), or omit "provider" to use the agent's current model. Connected right now: ${connected}.`,
    };
  }
  return { ok: true, id: match.id };
}

/**
 * Resolve a written model for an already-resolved provider: the id itself, then
 * the NAME the user says for it ("Luna", "Opus 4.6", "sonnet" → the newest
 * Sonnet the provider offers), then the legacy tier aliases. An open catalog
 * still resolves a name it has a table for, and takes anything else verbatim.
 *
 * The spoken step is the one that closes the gap: pins carry ids, users say
 * names, and a name that resolved to nothing used to leave the mission running
 * on the provider's DEFAULT instead of what was asked for.
 */
export function resolveModelChoice(
  raw: string,
  provider: ProviderOption,
  operation: string,
): ChoiceResolution {
  const wanted = raw.trim();
  const models = provider.models ?? [];
  const spoken = resolveSpokenModel(provider.id, wanted, models);
  if (!models.length) return { ok: true, id: spoken?.id ?? wanted };
  const exact = models.find((m) => m.toLowerCase() === wanted.toLowerCase());
  if (exact) return { ok: true, id: exact };
  if (spoken) return { ok: true, id: spoken.id };
  const alias = canonicalModelId(provider.id, wanted);
  if (alias && models.includes(alias)) return { ok: true, id: alias };
  return {
    ok: false,
    reason: "unknown",
    message: `The value given for "model" does not match what ${operation} accepts for ${provider.id} (${provider.name}). "model" must be one of: ${namedModelList(provider.id, models, MAX_LISTED_MODELS)}. You gave ${JSON.stringify(raw)}. Omit "model" to use that provider's default.`,
  };
}

/** The option a written provider names, by id, display name, or alias. */
function matchProvider(
  raw: string,
  options: readonly ProviderOption[],
): ProviderOption | undefined {
  const wanted = raw.trim().toLowerCase();
  if (!wanted) return undefined;
  const byId = options.find((o) => o.id.toLowerCase() === wanted);
  if (byId) return byId;
  const byName = options.find((o) => o.name.toLowerCase() === wanted);
  if (byName) return byName;
  const canonical = canonicalProviderId(wanted);
  return canonical
    ? options.find((o) => o.id.toLowerCase() === canonical.toLowerCase())
    : undefined;
}
