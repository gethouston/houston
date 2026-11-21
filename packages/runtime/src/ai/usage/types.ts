import type { ProviderUsageWindow } from "@houston/runtime-client";

export type {
  ProviderUsage,
  ProviderUsageCredits,
  ProviderUsageStatus,
  ProviderUsageTokens,
  ProviderUsageWindow,
  ProviderUsageWindowId,
} from "@houston/runtime-client";

export function clampPercent(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, n));
}

export function epochSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return null;
  return new Date(value * 1000).toISOString();
}

export function settleWindow(
  window: ProviderUsageWindow,
  now: number,
): ProviderUsageWindow {
  if (window.resetsAt === null) return window;
  const resetAt = Date.parse(window.resetsAt);
  if (Number.isNaN(resetAt) || resetAt > now) return window;
  return { ...window, usedPercent: 0, resetsAt: null };
}
