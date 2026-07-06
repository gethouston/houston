import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";

/** Default usage window (contract §5: host clamps `days` to ≤ 90). */
export const USAGE_DEFAULT_DAYS = 30;

/**
 * Per-agent/user message-usage counters (Teams v2) over the last `days`.
 *
 * Multiplayer-only and owner/admin-only, same gating as {@link useOrgAudit}:
 * the caller passes `enabled` from `capabilities.multiplayer` + role, and the
 * gateway 403s a plain member. Usage aggregates change slowly (a daily counter
 * upsert), so a longer `staleTime` avoids refetch churn while a window-focus
 * refetch still catches the day's accumulation. No matching `HoustonEvent`, so
 * there's nothing to invalidate on. Failures surface via `tauriOrg.usage` →
 * `call()` (toast + Report bug).
 */
export function useOrgUsage(
  enabled: boolean,
  days: number = USAGE_DEFAULT_DAYS,
) {
  return useQuery({
    queryKey: queryKeys.orgUsage(days),
    queryFn: () => tauriOrg.usage(days),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
