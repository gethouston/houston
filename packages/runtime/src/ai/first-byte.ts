import { OPENAI_COMPATIBLE } from "./openai-compatible-model";

export const FIRST_BYTE_EXTRA_ATTEMPTS = 2;

const MS_PER_PROMPT_TOKEN = 50 / 1000;

// WHY: Providers open the response only after reading the prompt; scale by prompt size. ADR-0007
export function firstByteDeadlineMs(
  provider: string,
  configuredMs: number,
  promptTokens?: number,
): number {
  if (provider === OPENAI_COMPATIBLE) return 0;
  if (!(Number.isFinite(configuredMs) && configuredMs > 0)) return 0;
  const tokens =
    promptTokens !== undefined && Number.isFinite(promptTokens)
      ? Math.max(0, promptTokens)
      : 0;
  return configuredMs + Math.round(tokens * MS_PER_PROMPT_TOKEN);
}

export function unansweredWindowMs(
  provider: string,
  configuredMs: number,
  promptTokens?: number,
): number {
  const deadline = firstByteDeadlineMs(provider, configuredMs, promptTokens);
  if (deadline === 0) return 0;
  return Math.round(deadline * (FIRST_BYTE_EXTRA_ATTEMPTS + 1 + 1 / 3));
}

export function unansweredWindows(
  configuredMs: number,
): (provider: string, promptTokens?: number) => number {
  return (provider, promptTokens) =>
    unansweredWindowMs(provider, configuredMs, promptTokens);
}
