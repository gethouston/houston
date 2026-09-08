import {
  activeProvider,
  canonicalPinProvider,
  resolveModel,
} from "./providers";

/**
 * The ground-truth `[turn]` diagnostic: the provider, model and API base URL a
 * turn ACTUALLY runs on, after the pin is applied.
 *
 * baseUrl is the unambiguous half — opencode.ai/zen/go/v1 is OpenCode Go,
 * chatgpt.com/backend-api is Codex — unlike asking the model itself, which open
 * models (GLM/Kimi/…) routinely get wrong.
 *
 * `pinned` exists because the pre-pin answer and the post-pin answer differ, and
 * a reader cannot tell which one a bare line is: a mission pinned to
 * `openai-codex` on an agent saved to Claude announced `provider=anthropic
 * model=claude-sonnet-5` while running on Codex, and the whole diagnosis that
 * followed chased the wrong provider.
 */

/** A turn's provider/model pin. Absent fields inherit the agent's settings. */
export interface TurnPinSource {
  provider?: string | null;
  model?: string | null;
}

/** The provider/model/endpoint a turn resolved onto, and whether a pin chose it. */
export interface TurnTarget {
  provider: string;
  model?: string;
  baseUrl?: string;
  pinned: boolean;
}

/**
 * Resolve the target a turn will run on, exactly as the turn does
 * (`resolveModel` applies the pin, canonicalizes `openai` → `openai-codex`, and
 * falls a stale SAVED id back to the provider default).
 *
 * A pin naming an unknown provider — or no connected provider at all — makes
 * `resolveModel` throw. That failure is the turn's own to report (an `error`
 * event plus a `[provider_error]` line moments later), so this still answers,
 * naming WHO the turn aimed at with the model left unknown: a silent line here
 * was how the pinned-and-logged-out case ended up with no diagnostic at all.
 */
export function resolveTurnTarget(pin?: TurnPinSource): TurnTarget {
  const pinned = Boolean(pin?.provider || pin?.model);
  try {
    const model = resolveModel(pin?.model, pin?.provider) as {
      provider?: string;
      id?: string;
      baseUrl?: string;
    };
    return {
      provider: model.provider ?? UNKNOWN,
      model: model.id,
      baseUrl: model.baseUrl,
      pinned,
    };
  } catch {
    const aimed = pin?.provider
      ? canonicalPinProvider(pin.provider)
      : activeProvider();
    return { provider: aimed ?? UNKNOWN, pinned };
  }
}

const UNKNOWN = "?";

/**
 * Whether this target describes a turn worth announcing. A request with no pin
 * and no connected provider is refused by the route (409) and never becomes a
 * turn — a `[turn]` line for it would claim a run that never happened. Anything
 * else runs, including a pinned turn on a logged-out agent, whose failure needs
 * a target on the record.
 */
export function turnTargetIsRunnable(target: TurnTarget): boolean {
  return target.pinned || target.provider !== UNKNOWN;
}

/** The one-line form every turn path logs, so the two never drift apart. */
export function formatTurnDiagnostic(target: TurnTarget): string {
  return `[turn] provider=${target.provider} model=${target.model ?? UNKNOWN} baseUrl=${target.baseUrl ?? UNKNOWN} pinned=${target.pinned}`;
}

/** Announce the turn's effective target on the runtime log. */
export function logTurnTarget(target: TurnTarget): void {
  console.log(formatTurnDiagnostic(target));
}
