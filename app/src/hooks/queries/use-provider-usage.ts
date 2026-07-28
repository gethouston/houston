import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriProvider } from "../../lib/tauri";
import {
  AI_HUB_VIEW_ID,
  isActiveTopLevelView,
} from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";

/**
 * Live per-account provider usage for the AI Models hub's Connected strip: each
 * connected provider's rate-limit windows (Claude 5h/weekly, Codex
 * session/weekly, Copilot quotas) and prepaid balances, read by the engine from
 * the providers' own usage APIs.
 *
 * `enabled` is the gate, and it is NOT the strip's mount: the strip carries the
 * user's accounts, which by design includes the ones whose probe could not be
 * confirmed (HOU-979). `providerUsage()` deliberately throws rather than
 * fabricate a reading, so the caller passes the real precondition — at least one
 * CONFIRMED connection (`hasConfirmedAccount`) — and a strip of nothing but
 * unconfirmed rows costs zero requests instead of one failure per interval.
 *
 * The interval is deliberately slow. The hub is a routine browse destination,
 * not a monitor: every poll fans out to each connected provider's own
 * rate-limited usage API, and a reading that is a few minutes old changes no
 * decision a user makes here. Five minutes plus a refetch on window focus keeps
 * the numbers fresh when someone actually looks, at a fifth of the traffic a
 * per-minute poll would generate on a tab left open. A connect/sign-out
 * invalidates via `ProviderLoginComplete` (see agent-invalidation-plan.ts), so
 * the interval never gates a change the user just made. The hub also stays
 * mounted while another screen is on top of it, so the poll is additionally
 * gated on the hub actually being the visible screen.
 *
 * Failures render as an honest inline note on the affected rows; the engine
 * call is `toast: false` for that reason (see `tauriProvider.usage`).
 */
export function useProviderUsage(enabled: boolean) {
  const active = useUIStore((s) =>
    isActiveTopLevelView(s.viewMode, AI_HUB_VIEW_ID),
  );
  return useQuery({
    queryKey: queryKeys.providerUsage(),
    queryFn: () => tauriProvider.usage(),
    // The hub is kept alive (HOU-813): it keeps showing the last reading while
    // hidden, but must not poll or refetch on window focus off screen.
    enabled: enabled && active,
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: true,
  });
}
