export interface ModelWindow {
  default: number;
  max: number;
}

interface WindowOverride {
  default: number;
  max?: number;
}

// WHY: Follows Codex /status: 95% of 272k standard, 95% of 872k ceiling, not pi's catalog. ADR-0014
export const MODEL_WINDOW_OVERRIDES: Readonly<
  Record<string, Readonly<Record<string, WindowOverride>>>
> = {
  "openai-codex": {
    "gpt-6-astra": { default: 258_400, max: 828_400 },
    "gpt-6.2-astra": { default: 258_400, max: 828_400 },
    "gpt-6-luna": { default: 258_400, max: 828_400 },
    "gpt-6-sol": { default: 258_400, max: 828_400 },
    "gpt-5.6-sol": { default: 258_400, max: 828_400 },
    "gpt-5.6-terra": { default: 258_400, max: 828_400 },
    "gpt-5.6-luna": { default: 258_400, max: 828_400 },
  },
};

export function resolveModelWindow(
  providerId: string,
  modelId: string,
  piRawWindow: number,
): ModelWindow {
  const override = MODEL_WINDOW_OVERRIDES[providerId]?.[modelId];
  const def = override?.default ?? piRawWindow;
  return { default: def, max: override?.max ?? def };
}

export function effectiveModelWindow(
  providerId: string,
  modelId: string,
  piRawWindow: number,
  observedTokens: number,
): number {
  const { default: def, max } = resolveModelWindow(
    providerId,
    modelId,
    piRawWindow,
  );
  const estimate = observedTokens > def ? max : def;
  return Math.max(estimate, observedTokens);
}

export const AUTOCOMPACT_CEILING_TOKENS = 200_000;

export const AUTOCOMPACT_THRESHOLD_PERCENT = 93;

export const LONG_CONTEXT_WINDOW_TOKENS = 1_000_000;

export const GPT_6_MAX_INPUT_TOKENS = 922_000;

const GPT_6_LINE =
  /(?:^|[./])gpt-(?:6(?:\.\d+)?|5\.6)-(?:luna|sol|terra|astra)(?:$|[-:])/;

export function modelInputLimit(modelId: string): number | undefined {
  return GPT_6_LINE.test(modelId) ? GPT_6_MAX_INPUT_TOKENS : undefined;
}

export function autocompactPoint(window: number, inputLimit?: number): number {
  const atThreshold = (window * AUTOCOMPACT_THRESHOLD_PERCENT) / 100;
  const point =
    window >= LONG_CONTEXT_WINDOW_TOKENS
      ? atThreshold
      : Math.min(atThreshold, AUTOCOMPACT_CEILING_TOKENS);
  return inputLimit === undefined
    ? point
    : Math.min(point, (inputLimit * AUTOCOMPACT_THRESHOLD_PERCENT) / 100);
}

export function compactionWindow(window: number, inputLimit?: number): number {
  const room =
    window >= LONG_CONTEXT_WINDOW_TOKENS
      ? window
      : Math.min(
          window,
          Math.round(
            (AUTOCOMPACT_CEILING_TOKENS * 100) / AUTOCOMPACT_THRESHOLD_PERCENT,
          ),
        );
  return inputLimit === undefined ? room : Math.min(room, inputLimit);
}
