import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriProvider } from "../../lib/tauri";
import {
  isActiveTopLevelView,
  SETTINGS_VIEW_ID,
} from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";

/**
 * Live per-account provider usage for the AI Hub's Usage tab: each connected
 * provider's rate-limit windows (Claude 5h/weekly, Codex session/weekly,
 * Copilot quotas) and prepaid balances, read by the engine from the
 * providers' own usage APIs.
 *
 * Providers meter in near-real time, so rows refresh on a 60s interval while
 * the tab is mounted (`enabled`) and on window focus — matching how usage
 * actually moves during an agent session. A connect/sign-out invalidates via
 * `ProviderLoginComplete` (see agent-invalidation-plan.ts). Failures surface
 * through `tauriProvider.usage` → `call()` (toast + Report bug).
 */
export function useProviderUsage(enabled: boolean) {
  const active = useUIStore((s) =>
    isActiveTopLevelView(s.viewMode, SETTINGS_VIEW_ID),
  );
  return useQuery({
    queryKey: queryKeys.providerUsage(),
    queryFn: () => tauriProvider.usage(),
    // Usage is a Settings section (HOU-788), and the Settings screen is kept
    // alive: it preserves the last result, but a hidden one must not poll or
    // refetch when the window regains focus.
    enabled: enabled && active,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
