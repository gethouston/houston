/**
 * Per-account provider usage — fetch-side helpers over the protocol v3 wire
 * shapes (`GET /providers/usage`). The SHAPES live in `@houston/protocol`
 * (`ProviderUsage` + friends, re-exported through `@houston/runtime-client`);
 * this module re-exports them for the fetchers plus the numeric guards every
 * fetcher normalizes provider payloads with.
 */

import type { ProviderUsageWindow } from "@houston/runtime-client";

export type {
  ProviderUsage,
  ProviderUsageCredits,
  ProviderUsageStatus,
  ProviderUsageTokens,
  ProviderUsageWindow,
  ProviderUsageWindowId,
} from "@houston/runtime-client";

/** Clamp a provider-reported percentage onto 0–100, dropping NaN/negatives. */
export function clampPercent(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, n));
}

/** Epoch seconds → ISO instant, or null for absent/invalid input. */
export function epochSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return null;
  return new Date(value * 1000).toISOString();
}

/**
 * A window whose reset instant has already passed has ROLLED OVER: the next
 * request opens a fresh window at 0%, so the utilization the provider still
 * reports for it describes a window that no longer exists. Both subscription
 * usage APIs keep answering with the previous window until the account makes
 * another request, and the strip drew that as "49% used" / "100% used" with
 * no reset note, hours after both windows had reset. Report the window as
 * empty with no reset scheduled instead (Claude's own /usage and CodexBar
 * both drop an elapsed window rather than draw it).
 */
export function settleWindow(
  window: ProviderUsageWindow,
  now: number,
): ProviderUsageWindow {
  if (window.resetsAt === null) return window;
  const resetAt = Date.parse(window.resetsAt);
  if (Number.isNaN(resetAt) || resetAt > now) return window;
  return { ...window, usedPercent: 0, resetsAt: null };
}
