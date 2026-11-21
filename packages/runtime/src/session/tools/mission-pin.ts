import {
  modelDisplayName,
  type ProviderOption,
  resolveModelChoice,
  resolveProviderChoice,
} from "@houston/domain";
import type { TurnModel } from "../turn-model-context";
import { START_MISSION_TOOL_NAME } from "./mission-tool-names";
import type { SessionToolErrorDetails } from "./tool-error";

export function resolveMissionPin(
  params: { provider?: string; model?: string },
  options: readonly ProviderOption[],
  inherited?: string,
):
  | { ok: true; pin: { provider?: string; model?: string } }
  | SessionToolErrorDetails {
  const pin: { provider?: string; model?: string } = {};
  if (params.provider) {
    const resolved = resolveProviderChoice(
      params.provider,
      options,
      START_MISSION_TOOL_NAME,
    );
    if (!resolved.ok)
      return {
        ok: false,
        error: { code: "invalid_provider", message: resolved.message },
      };
    pin.provider = resolved.id;
  }
  if (params.model) {
    const against = options.find((o) => o.id === (pin.provider ?? inherited));
    if (!against) {
      pin.model = params.model.trim();
      return { ok: true, pin };
    }
    const resolved = resolveModelChoice(
      params.model,
      against,
      START_MISSION_TOOL_NAME,
    );
    if (!resolved.ok)
      return {
        ok: false,
        error: { code: "invalid_model", message: resolved.message },
      };
    pin.model = resolved.id;
  }
  return { ok: true, pin };
}

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
