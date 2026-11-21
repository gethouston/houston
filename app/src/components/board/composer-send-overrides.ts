import type { ModelPin } from "../../lib/model-selector-lock";
import type { TurnMode } from "../../lib/turn-mode";
import type { SendOverrides } from "./board-source";

export function composerSendOverrides(
  pin: ModelPin,
  modeOverride: TurnMode,
): SendOverrides {
  return { ...pinOverrides(pin), modeOverride };
}

export function settleOnPin(
  overrides: SendOverrides,
  pin: ModelPin,
): SendOverrides {
  return { ...overrides, ...pinOverrides(pin) };
}

function pinOverrides(
  pin: ModelPin,
): Pick<
  SendOverrides,
  "providerOverride" | "modelOverride" | "effortOverride"
> {
  return {
    providerOverride: pin.provider,
    modelOverride: pin.model,
    effortOverride: pin.effort,
  };
}
