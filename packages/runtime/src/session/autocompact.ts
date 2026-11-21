import { autocompactPoint } from "@houston/protocol/model-windows";

export function resolveAutocompactOverride(
  raw: string | undefined = process.env.HOUSTON_AUTOCOMPACT_THRESHOLD,
): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : undefined;
}

export function needsAutocompact(
  tokens: number | null,
  contextWindow: number,
  overridePercent: number | undefined = resolveAutocompactOverride(),
  inputLimit?: number,
): boolean {
  if (tokens == null || contextWindow <= 0) return false;
  const point =
    overridePercent === undefined
      ? autocompactPoint(contextWindow, inputLimit)
      : (Math.min(contextWindow, inputLimit ?? contextWindow) *
          overridePercent) /
        100;
  return tokens >= point;
}
