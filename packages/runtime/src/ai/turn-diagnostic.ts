import {
  activeProvider,
  canonicalPinProvider,
  resolveModel,
} from "./providers";

export interface TurnPinSource {
  provider?: string | null;
  model?: string | null;
}

export interface TurnTarget {
  provider: string;
  model?: string;
  baseUrl?: string;
  pinned: boolean;
}

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

export function turnTargetIsRunnable(target: TurnTarget): boolean {
  return target.pinned || target.provider !== UNKNOWN;
}

export function formatTurnDiagnostic(target: TurnTarget): string {
  return `[turn] provider=${target.provider} model=${target.model ?? UNKNOWN} baseUrl=${target.baseUrl ?? UNKNOWN} pinned=${target.pinned}`;
}

export function logTurnTarget(target: TurnTarget): void {
  console.log(formatTurnDiagnostic(target));
}
