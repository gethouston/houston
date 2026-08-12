import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriOrg } from "../../lib/tauri";
import {
  isActiveTopLevelView,
  ORGANIZATION_VIEW_ID,
} from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";

/**
 * One fetch covers every client-side range (7d / 30d / 13w); the gateway
 * clamps `days` to ≤ 90 anyway, so the model buckets locally and range
 * switches never refetch.
 */
export const COMPUTE_USAGE_DAYS = 90;

/**
 * Per-agent compute usage (engine running time) over the last 90 days.
 *
 * Cloud-only: the caller passes `enabled` from `capabilities.computeUsage`,
 * so no request can ever fire on desktop/self-host (where the route does not
 * exist). Scoping is server-side — members get only their assigned agents.
 *
 * Closed days never change, but an agent that is running right now grows
 * "today" continuously — while `awakeNow` is non-empty the query ticks every
 * minute so the current bar visibly accrues, otherwise it relaxes to five.
 * There is no pod wake/sleep `HoustonEvent` to invalidate on (same as
 * {@link useOrgUsage}); space switches already drop the whole query cache.
 * Failures surface via `tauriOrg.computeUsage` → `call()` (toast + Report bug).
 */
export function useComputeUsage(enabled: boolean) {
  const active = useUIStore((s) =>
    isActiveTopLevelView(s.viewMode, ORGANIZATION_VIEW_ID),
  );
  return useQuery({
    queryKey: queryKeys.computeUsage(COMPUTE_USAGE_DAYS),
    queryFn: () => tauriOrg.computeUsage(COMPUTE_USAGE_DAYS),
    // This is the Time worked section's own read (Admin > Time
    // worked), and Admin is kept alive: it stays mounted while hidden, on
    // whichever tab it was left on. Disable the observer off screen so
    // neither its interval nor its focus refetch wakes a pod-held read. Gate on
    // the SCREEN that renders it — gating on any other view id disables the
    // observer exactly when the section is on the glass and the fetch never fires.
    // The section itself is the second half of the gate: Admin mounts only the
    // sub-tab the user selected, so no observer exists while Activity or Usage
    // is up.
    enabled: enabled && active,
    staleTime: 20_000,
    // The pod flushes its report on every turn start/end (edge-triggered), so
    // a 30s poll while an agent is up keeps fresh numbers visible within
    // seconds of work happening; idle agents relax to a 5-minute tick.
    refetchInterval: (query) =>
      (query.state.data?.awakeNow.length ?? 0) > 0 ? 30_000 : 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
