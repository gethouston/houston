export interface LiveTurnPin {
  provider: string;
  model?: string;
  effort?: string;
}

export function liveTurnPin(pin?: {
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
}): LiveTurnPin | undefined {
  if (!pin?.provider) return undefined;
  return {
    provider: pin.provider,
    ...(pin.model ? { model: pin.model } : {}),
    ...(pin.effort ? { effort: pin.effort } : {}),
  };
}
