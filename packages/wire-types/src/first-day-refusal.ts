import type { FirstDayRefusal, FirstDayRefusalCode } from "@houston/protocol";

export type { FirstDayRefusal } from "@houston/protocol";

const CODES: readonly string[] = [
  "first_day_not_pending",
  "first_day_not_started",
  "first_day_no_provider",
  "first_day_provider_unavailable",
] satisfies readonly FirstDayRefusalCode[];

export function parseFirstDayRefusal(body: unknown): FirstDayRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.code !== "string" ||
    !CODES.includes(value.code) ||
    typeof value.error !== "string"
  )
    return null;
  const refusal: FirstDayRefusal = {
    code: value.code as FirstDayRefusalCode,
    error: value.error,
  };
  if (
    value.code === "first_day_no_provider" &&
    typeof value.provider === "string" &&
    value.provider
  )
    refusal.provider = value.provider;
  return refusal;
}

export function parseFirstDayRefusalText(text: string): FirstDayRefusal | null {
  try {
    return parseFirstDayRefusal(JSON.parse(text));
  } catch {
    return null;
  }
}
