import {
  modelDisplayName,
  type ProviderOption,
  resolveModelChoice,
  resolveProviderChoice,
} from "@houston/domain";
import type { TurnModel } from "../turn-model-context";
import { START_MISSION_TOOL_NAME } from "./mission-tool-names";

/**
 * What a written provider/model becomes: the real ids a mission is started
 * with, the refusal that names every value it could have used instead, and the
 * sentence the tool may tell the user it runs on.
 *
 * The `options` every function here takes is the provider status resolved when
 * the tool RUNS, in the acting member's own scope — the schema's accepted
 * values (mission-providers.ts) are frozen into the session's cached tool defs,
 * so a provider connected, or disconnected, since then is judged here exactly
 * as it stands during the turn. The host's own check at
 * `POST /sandbox/missions/start` is the final word.
 */

/**
 * Resolve what the model wrote into real ids, or throw the sentence that says
 * which values it could have used. `inherited` is the provider the mission would
 * ride when this call names none — the one a lone `model` is checked against.
 */
export function resolveMissionPin(
  params: { provider?: string; model?: string },
  options: readonly ProviderOption[],
  inherited?: string,
): { provider?: string; model?: string } {
  const pin: { provider?: string; model?: string } = {};
  if (params.provider) {
    const resolved = resolveProviderChoice(
      params.provider,
      options,
      START_MISSION_TOOL_NAME,
    );
    if (!resolved.ok) throw new Error(resolved.message);
    pin.provider = resolved.id;
  }
  if (params.model) {
    const against = options.find((o) => o.id === (pin.provider ?? inherited));
    if (!against) {
      pin.model = params.model.trim();
      return pin;
    }
    const resolved = resolveModelChoice(
      params.model,
      against,
      START_MISSION_TOOL_NAME,
    );
    if (!resolved.ok) throw new Error(resolved.message);
    pin.model = resolved.id;
  }
  return pin;
}

/**
 * The child mission's model pin: the agent's RESOLVED choice, defaulting to the
 * PARENT turn's provider/model — "omit to use the current one". The default is
 * load-bearing, not cosmetic: on managed cloud the runtime holds no standing
 * provider (the gateway injects one per USER send), so an unpinned child turn is
 * refused with "No provider connected". A model named WITHOUT a provider rides
 * the inherited provider; a provider named without a model gets that provider's
 * default (no cross-provider mixing of the parent's model id).
 */
export function missionPin(
  chosen: { provider?: string; model?: string },
  inherited: TurnModel | undefined,
): { provider?: string; model?: string } {
  if (chosen.provider) {
    return {
      provider: chosen.provider,
      ...(chosen.model ? { model: chosen.model } : {}),
    };
  }
  const provider = inherited?.provider;
  const model = chosen.model ?? inherited?.model;
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}

/**
 * What the tool may TELL the user a mission runs on: only ids that survived
 * resolution here AND the host's own check (a refusal never reaches this), and
 * nothing at all when the mission carries no pin. An echo of the request would
 * claim a provider the mission may never have run on.
 *
 * The model is named with the name the user knows it by, so a request that
 * could fit several rows ("use Sonnet") comes back saying WHICH one it pinned.
 */
export function missionRunsOn(
  pin: { provider?: string; model?: string },
  options: readonly ProviderOption[],
): string {
  if (!pin.provider && !pin.model) return "";
  const named = options.find((o) => o.id === pin.provider);
  const provider = pin.provider
    ? ` on ${pin.provider}${named ? ` (${named.name})` : ""}`
    : "";
  const spoken = pin.provider
    ? modelDisplayName(pin.provider, pin.model ?? "")
    : undefined;
  const model = pin.model
    ? ` with model ${pin.model}${spoken ? ` (${spoken})` : ""}`
    : "";
  return ` It runs${provider}${model}.`;
}
