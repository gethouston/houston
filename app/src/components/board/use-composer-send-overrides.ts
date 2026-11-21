import { useMemo } from "react";
import type { TurnMode } from "../../lib/turn-mode";
import type { SendOverrides } from "./board-source";
import { composerSendOverrides } from "./composer-send-overrides";

export interface ComposerPinSource {
  effectiveProvider: string;
  effectiveModel: string;
  effectiveEffort: string | undefined;
  turnMode: TurnMode;
}

export function useComposerSendOverrides(
  panel: ComposerPinSource,
): SendOverrides {
  const {
    effectiveProvider: provider,
    effectiveModel: model,
    effectiveEffort: effort,
    turnMode,
  } = panel;
  return useMemo(
    () => composerSendOverrides({ provider, model, effort }, turnMode),
    [provider, model, effort, turnMode],
  );
}
