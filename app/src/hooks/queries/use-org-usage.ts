import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import {
  isActiveTopLevelView,
  SETTINGS_VIEW_ID,
} from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";

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
  const active = useUIStore((s) =>
    isActiveTopLevelView(s.viewMode, SETTINGS_VIEW_ID),
  );
  return useQuery({
    queryKey: queryKeys.orgUsage(days),
    queryFn: () => tauriOrg.usage(days),
    // Admin is a Settings section (HOU-788) and Settings remains mounted while
    // hidden; avoid an unnecessary usage read when the app window regains focus
    // off that screen.
    enabled: enabled && active,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
