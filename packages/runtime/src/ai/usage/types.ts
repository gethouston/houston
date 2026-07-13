/**
 * Per-account provider usage — fetch-side helpers over the protocol v3 wire
 * shapes (`GET /providers/usage`). The SHAPES live in `@houston/protocol`
 * (`ProviderUsage` + friends, re-exported through `@houston/runtime-client`);
 * this module re-exports them for the fetchers plus the numeric guards every
 * fetcher normalizes provider payloads with.
 */

export type {
  ProviderUsage,
  ProviderUsageCredits,
  ProviderUsageStatus,
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
